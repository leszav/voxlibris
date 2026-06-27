import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { storage } from './repositories/index.js';
import { BookFormat, bookReadingStatus } from '../shared/schema.js';
import { jwtAuth, requireActiveUser } from './jwt-middleware.js';
import crypto from 'node:crypto';
import { BookParserFactory } from './book-parser.js';
import type { BookMetadata, BookChapter } from './book-parser.js';
import { CryptoService } from './crypto-service.js';
import { fileStorage } from './file-storage.js';
import { duplicateDetectionService } from './duplicate-detection-service.js';
import { logger } from './lib/logger.js';
import { optimizeImage } from './image-optimizer.js';
import { db } from './db.js';
import { and, eq } from 'drizzle-orm';
import { genreService } from './services/genre-service.js';
import { EntitlementError, EntitlementService } from './services/commerce/entitlement-service.js';

const router = Router();

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeUploadFileName(fileName: string): string {
    return fileName.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

function entitlementDenied(error: EntitlementError) {
    return { message: error.message, code: error.code, featureKey: error.featureKey, upgradeUrl: '/pricing' };
}

const MAX_BOOK_UPLOAD_BYTES = parsePositiveInt(process.env.MAX_BOOK_UPLOAD_MB, 50) * 1024 * 1024;
const MAX_ACTIVE_UPLOAD_SESSIONS = parsePositiveInt(process.env.MAX_ACTIVE_UPLOAD_SESSIONS, 200);
const MAX_ACTIVE_UPLOAD_SESSIONS_PER_USER = parsePositiveInt(process.env.MAX_ACTIVE_UPLOAD_SESSIONS_PER_USER, 5);
const UPLOAD_SESSION_TTL_MS = parsePositiveInt(process.env.UPLOAD_SESSION_TTL_MINUTES, 20) * 60 * 1000;
const UPLOAD_SESSION_CLEANUP_INTERVAL_MS = parsePositiveInt(process.env.UPLOAD_SESSION_CLEANUP_INTERVAL_MINUTES, 5) * 60 * 1000;
const MAX_METADATA_COVER_BYTES = parsePositiveInt(process.env.MAX_METADATA_COVER_MB, 1) * 1024 * 1024;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_BOOK_UPLOAD_BYTES,
        files: 1,
        fields: 20,
        fieldSize: 2 * 1024 * 1024,
        parts: 25,
    },
});

// Upload session metadata (file buffer stored in MinIO temp storage, not in RAM)
interface UploadSession {
    userId: string;
    tempStorageKey: string; // MinIO key for the raw file
    originalName: string;
    mimeType: string;
    fileSize: number;
    parsedMetadata: UploadMetadata;
    createdAt: Date;
}

type UploadMetadata = Omit<Partial<BookMetadata>, 'coverImageData' | 'coverImageType'> & {
    coverImageData?: Buffer | string | null;
    coverImageType?: string | null;
};

function decodeCoverImageData(coverImageData: string, warningMessage: string): Buffer | undefined {
    try {
        const dataUrlRegex = /^data:([A-Za-z+/-]+);base64,(.+)$/;
        const matches = dataUrlRegex.exec(coverImageData);
        const encodedImage = matches?.[2] ?? coverImageData;
        return Buffer.from(encodedImage, 'base64');
    } catch (error) {
        console.warn(warningMessage, error);
        return undefined;
    }
}

function resolveCoverBuffer(metadata: UploadMetadata, session: UploadSession): Buffer | undefined {
    if (typeof metadata.coverImageData === 'string') {
        return decodeCoverImageData(metadata.coverImageData, '[PersonalBooks] Failed to parse cover image');
    }

    if (metadata.coverImageData === null) {
        return undefined;
    }

    if (typeof session.parsedMetadata.coverImageData === 'string') {
        return decodeCoverImageData(session.parsedMetadata.coverImageData, '[PersonalBooks] Failed to parse cached cover image');
    }

    if (Buffer.isBuffer(session.parsedMetadata.coverImageData)) {
        return session.parsedMetadata.coverImageData;
    }

    return undefined;
}

function normalizeUploadMetadata(metadata: UploadMetadata): UploadMetadata {
    const normalized: UploadMetadata = { ...metadata };

    if (Buffer.isBuffer(metadata.coverImageData)) {
        if (metadata.coverImageData.length > MAX_METADATA_COVER_BYTES) {
            normalized.coverImageData = undefined;
            normalized.coverImageType = undefined;
            return normalized;
        }

        const coverType = metadata.coverImageType || 'image/jpeg';
        normalized.coverImageData = `data:${coverType};base64,${metadata.coverImageData.toString('base64')}`;
        normalized.coverImageType = coverType;
    }

    return normalized;
}

async function enrichUploadMetadataWithGenreLabels(metadata: UploadMetadata): Promise<UploadMetadata> {
    const genreInput = [metadata.genre, ...(Array.isArray(metadata.genres) ? metadata.genres : [])]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (genreInput.length === 0) {
        return metadata;
    }

    const presentation = await genreService.buildUploadGenrePresentation(genreInput);
    if (!presentation) {
        return metadata;
    }

    return {
        ...metadata,
        genre: presentation.genre,
        genres: presentation.genres,
    };
}

// Cache for parsed books (to avoid re-parsing on every request)
interface ParsedBookCache {
    chapters: BookChapter[];
    title: string;
    author: string;
    totalChapters: number;
    cachedAt: Date;
    lastAccessedAt: Date;
}

const uploadSessions = new Map<string, UploadSession>();
const bookCache = new Map<string, ParsedBookCache>();

// Cache settings
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 50; // Max number of books cached in memory

// LRU eviction: remove the least recently accessed entry
function evictLRUCache(): void {
    if (bookCache.size <= MAX_CACHE_SIZE) return;
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of bookCache.entries()) {
        if (entry.lastAccessedAt.getTime() < oldestTime) {
            oldestTime = entry.lastAccessedAt.getTime();
            oldestKey = key;
        }
    }
    if (oldestKey) {
        bookCache.delete(oldestKey);
        logger.info({ bookId: oldestKey }, '[Cache LRU] Evicted book');
    }
}

// Clean up old sessions (metadata + MinIO temp files) and cache periodically
setInterval(async () => {
    const now = new Date();
    
    // Clean up old upload sessions + their temp files in MinIO
    for (const [id, session] of Array.from(uploadSessions.entries())) {
        if (now.getTime() - session.createdAt.getTime() > UPLOAD_SESSION_TTL_MS) {
            try {
                await fileStorage.deleteFile(session.tempStorageKey);
            } catch (e) {
                console.warn(`[Cleanup] Failed to delete temp file ${session.tempStorageKey}:`, e);
            }
            uploadSessions.delete(id);
            logger.info({ sessionId: id }, '[Cleanup] Removed expired upload session');
        }
    }
    
    // Clean up old book cache entries
    for (const [bookId, cached] of Array.from(bookCache.entries())) {
        if (now.getTime() - cached.cachedAt.getTime() > CACHE_TTL_MS) {
            bookCache.delete(bookId);
            logger.info({ bookId }, '[Cache] Removed expired cache');
        }
    }
}, UPLOAD_SESSION_CLEANUP_INTERVAL_MS);

// 1. Initiate Upload
router.post('/upload', jwtAuth, requireActiveUser, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        if (uploadSessions.size >= MAX_ACTIVE_UPLOAD_SESSIONS) {
            return res.status(429).json({ error: 'Too many active upload sessions. Please try again later.' });
        }

        const activeSessionsForUser = Array.from(uploadSessions.values()).filter(
            (session) => session.userId === req.user?.id,
        ).length;

        if (activeSessionsForUser >= MAX_ACTIVE_UPLOAD_SESSIONS_PER_USER) {
            return res.status(429).json({ error: 'Too many active uploads for this user. Complete or wait for previous uploads to expire.' });
        }

        const fileType = await BookParserFactory.detectFileTypeFromBuffer(req.file.buffer, req.file.originalname);
        if (!fileType) {
            return res.status(400).json({ error: 'Unsupported or invalid file type. Only valid EPUB and FB2 are supported.' });
        }

        const parser = BookParserFactory.createParser(fileType);
        let metadata: UploadMetadata = {};

        try {
            const parsedBook = await parser.parseBook(req.file.buffer, req.file.originalname);
            metadata = parsedBook.metadata;
        } catch (e) {
            console.warn('Failed to parse book', e);
        }

        metadata = normalizeUploadMetadata(metadata);
        metadata = await enrichUploadMetadataWithGenreLabels(metadata);

        // Проверка дубликатов
        const title = metadata.title || req.file.originalname;
        const author = metadata.author || 'Unknown';
        
        const duplicates = await duplicateDetectionService.findPersonalBookDuplicates(
            req.user.id,
            title,
            author,
            85 // порог схожести 85%
        );

        const sessionId = crypto.randomUUID();

        // Store raw file in MinIO temp storage instead of RAM
        const safeOriginalName = sanitizeUploadFileName(req.file.originalname);
        const tempKey = `temp/uploads/${sessionId}/${safeOriginalName}`;
        await fileStorage.uploadFile(req.file.buffer, tempKey, req.file.mimetype);

        uploadSessions.set(sessionId, {
            userId: req.user.id,
            tempStorageKey: tempKey,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSize: req.file.buffer.length,
            parsedMetadata: metadata,
            createdAt: new Date()
        });

        // Convert cover image buffer to base64 string for preview
        let coverPreview: string | undefined;
        if (typeof metadata.coverImageData === 'string') {
            coverPreview = metadata.coverImageData;
        } else if (metadata.coverImageData && Buffer.isBuffer(metadata.coverImageData)) {
            const type = metadata.coverImageType || 'image/jpeg';
            coverPreview = `data:${type};base64,${metadata.coverImageData.toString('base64')}`;
        }

        // Remove raw buffer from metadata to avoid huge JSON and client issues
        const { coverImageData: _coverImageData, ...cleanMetadata } = metadata;

        res.json({
            sessionId,
            metadata: {
                title: cleanMetadata.title || req.file.originalname,
                author: cleanMetadata.author || 'Unknown',
                description: cleanMetadata.description,
                language: cleanMetadata.language,
                coverPreview, // Send as separate field or part of metadata for preview
                ...cleanMetadata
            },
            duplicates: duplicates.map(dup => ({
                bookId: dup.bookId,
                title: dup.title,
                author: dup.author,
                similarity: dup.similarity,
                matchReason: dup.matchReason
            }))
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper: Process cover image
async function processPersonalCoverImage(
    metadata: UploadMetadata,
    session: UploadSession,
    userId: string,
    sessionId: string
): Promise<string | undefined> {
    const coverBuffer = resolveCoverBuffer(metadata, session);

    if (!coverBuffer) return undefined;

    try {
        // Оптимизируем обложку перед загрузкой
        const optimized = await optimizeImage(coverBuffer, 'cover');
        const coverPath = `covers/personal/${userId}/${sessionId}-cover.webp`;
        
        logger.info({ 
            coverPath,
            originalSize: optimized.originalSize,
            optimizedSize: optimized.optimizedSize,
            compressionRatio: optimized.compressionRatio 
        }, '[PersonalBooks] Uploading optimized cover');
        
        const coverResult = await fileStorage.uploadFile(
            optimized.buffer,
            coverPath,
            optimized.mimeType
        );
        
        return `/api/storage/${coverResult.key}`;
    } catch (e) {
        logger.error({ error: e }, '[PersonalBooks] Failed to upload cover');
        return undefined;
    }
}

// Helper: Encrypt and upload book file
async function encryptAndUploadPersonalBook(
    fileBuffer: Buffer,
    userId: string,
    sessionId: string
): Promise<{ storagePath: string; encryptedKey: string }> {
    const cek = CryptoService.generateKey();
    const encryptedFile = CryptoService.encryptFile(fileBuffer, cek);
    const encryptedKey = CryptoService.encryptKey(cek);
    const storagePath = `personal/${userId}/${sessionId}.enc`;
    
    await fileStorage.uploadFile(encryptedFile, storagePath, 'application/octet-stream');
    
    return { storagePath, encryptedKey };
}

// 2. Confirm Upload
router.post('/upload/:sessionId/confirm', jwtAuth, requireActiveUser, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { metadata } = req.body;
        const session = uploadSessions.get(sessionId);

        if (!session) return res.status(404).json({ error: 'Session not found or expired' });
        if (session.userId !== req.user?.id) return res.status(403).json({ error: 'Forbidden' });

        try {
            const books = await storage.getPersonalBooksByUser(req.user.id);
            await new EntitlementService().assertLimit(req.user.id, 'personal_library.max_books', books.length, { scopeType: 'platform' });
        } catch (error) {
            if (error instanceof EntitlementError) return res.status(403).json(entitlementDenied(error));
            throw error;
        }

        // Download raw file from MinIO temp storage
        const fileBuffer = await fileStorage.getFile(session.tempStorageKey);

        const fileType = await BookParserFactory.detectFileTypeFromBuffer(fileBuffer, session.originalName);
        if (!fileType) {
            return res.status(400).json({ error: 'Invalid or unsupported file type' });
        }
        const format = fileType.toUpperCase() as BookFormat;

        // Calculate hash and encrypt
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        const { storagePath, encryptedKey } = await encryptAndUploadPersonalBook(
            fileBuffer,
            req.user.id,
            sessionId
        );

        // Upload cover
        const coverUrl = await processPersonalCoverImage(metadata, session, req.user.id, sessionId);

        // Create book record
        const book = await storage.createPersonalBook({
            userId: req.user.id,
            title: metadata.title || session.parsedMetadata.title || session.originalName,
            author: metadata.author || session.parsedMetadata.author || 'Unknown',
            description: metadata.description,
            format: format,
            fileHash,
            fileSizeBytes: fileBuffer.length,
            language: metadata.language,
            publicationYear: metadata.publicationYear ? Number.parseInt(metadata.publicationYear) : undefined,
            genre: metadata.genre,
            encryptedContentKey: encryptedKey,
            storagePath: storagePath,
            coverUrl: coverUrl,
        });

        const genreInput = [metadata.genre, ...(Array.isArray(metadata.genres) ? metadata.genres : [])]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

        const persistedGenres = await genreService.persistBookGenres('personal', book.id, genreInput, 'metadata');

        const bookWithGenres = await storage.updatePersonalBook(book.id, {
            primaryGenreId: persistedGenres.primaryGenreId ?? undefined,
            genre: persistedGenres.legacyGenre ?? undefined,
        });

        // Clean up: delete temp file from MinIO and remove session
        try {
            await fileStorage.deleteFile(session.tempStorageKey);
        } catch (e) {
            console.warn(`[PersonalBooks] Failed to clean temp file ${session.tempStorageKey}:`, e);
        }
        uploadSessions.delete(sessionId);
        if (!bookWithGenres) {
            return res.status(500).json({ error: 'Failed to persist genres for uploaded book' });
        }

        const genresPayload = await genreService.getBookGenresPayload('personal', book.id);
        res.json({
            ...bookWithGenres,
            primaryGenre: genresPayload.primaryGenre,
            genres: genresPayload.genres,
        });
    } catch (error) {
        console.error('Confirm upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// List Books
router.get('/', jwtAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const books = await storage.getPersonalBooksByUser(req.user.id);
    
    // Получить прогресс чтения для каждой книги
    const booksWithProgress = await Promise.all(
        books.map(async (book) => {
            try {
                const progress = await storage.getUserReadingProgress(req.user!.id, book.id);
                const genresPayload = await genreService.getBookGenresPayload('personal', book.id);
                return {
                    ...book,
                    progress: progress?.progress || 0,
                    currentChapter: progress?.currentChapter || 1,
                    primaryGenre: genresPayload.primaryGenre,
                    genres: genresPayload.genres,
                };
            } catch (error_) {
                console.warn('[PersonalBooks] Ошибка при обновлении прогресса:', error_);
                return {
                    ...book,
                    progress: 0,
                    currentChapter: 1,
                    primaryGenre: null,
                    genres: [],
                };
            }
        })
    );
    
    res.json(booksWithProgress);
});

// GET /api/v1/user/books/history - получить историю чтения пользователя
router.get('/history', jwtAuth, requireActiveUser, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const history = await storage.getReadingHistory(req.user.userId);
        res.json(history);
    } catch (error) {
        console.error('Get reading history error:', error);
        res.status(500).json({ error: 'Failed to get reading history' });
    }
});

// DELETE /api/v1/user/books/history - очистить историю чтения
router.delete('/history', jwtAuth, requireActiveUser, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        await storage.clearReadingHistory(req.user.userId);
        res.json({ message: 'History cleared successfully' });
    } catch (error) {
        console.error('Clear reading history error:', error);
        res.status(500).json({ error: 'Failed to clear reading history' });
    }
});

// Get Book
router.get('/:id', jwtAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const book = await storage.getPersonalBook(req.params.id);

    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const genresPayload = await genreService.getBookGenresPayload('personal', book.id);
    res.json({
        ...book,
        primaryGenre: genresPayload.primaryGenre,
        genres: genresPayload.genres,
    });
});

// Update Book
router.patch('/:id', jwtAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const book = await storage.getPersonalBook(req.params.id);

    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const updates = req.body as Record<string, unknown>;
    // Filter allowed updates
    const allowedUpdates = ['title', 'author', 'description', 'publicationYear', 'genre', 'language'] as const;
    const filteredUpdates: Partial<Parameters<typeof storage.updatePersonalBook>[1]> = {};
    for (const key of allowedUpdates) {
        const value = updates[key];
        if (value !== undefined) {
            filteredUpdates[key] = value as never;
        }
    }

    const updatedBook = await storage.updatePersonalBook(req.params.id, filteredUpdates);
    if (!updatedBook) return res.status(404).json({ error: 'Book not found' });

    const genreInput = [updates.genre, ...(Array.isArray(updates.genres) ? updates.genres : [])]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    const persistedGenres = await genreService.persistBookGenres('personal', req.params.id, genreInput, 'manual');
    const enrichedBook = await storage.updatePersonalBook(req.params.id, {
        primaryGenreId: persistedGenres.primaryGenreId ?? undefined,
        genre: persistedGenres.legacyGenre ?? undefined,
    });

    if (!enrichedBook) return res.status(404).json({ error: 'Book not found' });

    const genresPayload = await genreService.getBookGenresPayload('personal', req.params.id);
    res.json({
        ...enrichedBook,
        primaryGenre: genresPayload.primaryGenre,
        genres: genresPayload.genres,
    });
});

// Delete Book
router.delete('/:id', jwtAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const book = await storage.getPersonalBook(req.params.id);

    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const markAsAbandoned = req.query.markAsAbandoned === 'true';

    await storage.deletePersonalBook(req.params.id);

    if (markAsAbandoned) {
        const [existingAbandonedStatus] = await db
            .select()
            .from(bookReadingStatus)
            .where(and(
                eq(bookReadingStatus.userId, req.user.id),
                eq(bookReadingStatus.bookId, req.params.id),
                eq(bookReadingStatus.bookType, 'personal')
            ))
            .limit(1);

        if (existingAbandonedStatus) {
            await db
                .update(bookReadingStatus)
                .set({
                    status: 'abandoned',
                    progress: 0,
                    notes: existingAbandonedStatus.notes || 'Отмечено как не интересно',
                    updatedAt: new Date(),
                })
                .where(eq(bookReadingStatus.id, existingAbandonedStatus.id));
        } else {
            await db
                .insert(bookReadingStatus)
                .values({
                    userId: req.user.id,
                    bookId: req.params.id,
                    bookType: 'personal',
                    status: 'abandoned',
                    progress: 0,
                    notes: 'Отмечено как не интересно',
                });
        }
    }

    bookCache.delete(req.params.id);
    res.json({ success: true, archivedAsAbandoned: markAsAbandoned });
});

// Get Book Content (для ридера) - с кэшированием и ленивой загрузкой
router.get('/:id/content', jwtAuth, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        
        const book = await storage.getPersonalBook(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });
        if (book.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

        // Check query parameters
        const chapterNum = req.query.chapter ? Number.parseInt(req.query.chapter as string) : null;
        const initialLoad = req.query.initial === 'true';

        // Check cache first
        let cached = bookCache.get(book.id);
        
        if (!cached || cached === undefined) {
            logger.info({ bookId: book.id, title: book.title }, '[Cache MISS] Parsing book');
            
            // Получаем зашифрованный файл из S3
            const encryptedFile = await fileStorage.getFile(book.storagePath);
            
            // Расшифровываем ключ
            const cek = CryptoService.decryptKey(book.encryptedContentKey!);
            
            // Расшифровываем файл
            const decryptedFile = CryptoService.decryptFile(encryptedFile, cek);
            
            // Парсим книгу чтобы получить главы
            const format = book.format.toLowerCase(); // 'fb2' или 'epub'
            const parser = BookParserFactory.createParser(format as 'fb2' | 'epub');
            const parsedBook = await parser.parseBook(decryptedFile, `book.${format}`);
            
            // Кэшируем результат (with LRU eviction)
            cached = {
                chapters: parsedBook.chapters || [],
                title: book.title,
                author: book.author,
                totalChapters: parsedBook.chapters?.length || 1,
                cachedAt: new Date(),
                lastAccessedAt: new Date()
            };
            bookCache.set(book.id, cached);
            evictLRUCache();
            logger.info(
                { bookId: book.id, chapters: cached.totalChapters, size: bookCache.size, max: MAX_CACHE_SIZE },
                '[Cache] Cached book'
            );
        } else {
            cached.lastAccessedAt = new Date();
            logger.info({ bookId: book.id }, '[Cache HIT] Returning cached book');
        }

        // Если запрошена конкретная глава
        if (chapterNum !== null) {
            const chapter = cached.chapters.find(ch => ch.chapterNumber === chapterNum);
            if (!chapter) {
                return res.status(404).json({ error: 'Chapter not found' });
            }
            return res.json({
                book: {
                    id: book.id,
                    title: cached.title,
                    author: cached.author,
                    totalChapters: cached.totalChapters
                },
                chapter
            });
        }

        // Если initial load - возвращаем только первую главу + метаданные
        if (initialLoad) {
            const firstChapter = cached.chapters[0] || {
                chapterNumber: 1,
                title: cached.title,
                content: '',
                wordCount: 0
            };
            
            return res.json({
                book: {
                    id: book.id,
                    title: cached.title,
                    author: cached.author,
                    totalChapters: cached.totalChapters,
                    chapters: [firstChapter] // Только первая глава
                }
            });
        }

        // Полная загрузка всех глав (legacy support)
        res.json({
            book: {
                id: book.id,
                title: cached.title,
                author: cached.author,
                totalChapters: cached.totalChapters,
                chapters: cached.chapters
            }
        });
    } catch (error) {
        console.error('Get book content error:', error);
        res.status(500).json({ error: 'Failed to get book content' });
    }
});

router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: `File is too large. Maximum allowed size is ${Math.round(MAX_BOOK_UPLOAD_BYTES / 1024 / 1024)} MB.` });
        }
        return res.status(400).json({ error: err.message });
    }
    return next(err);
});

export default router;
