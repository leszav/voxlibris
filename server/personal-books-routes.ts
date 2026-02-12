import { Router } from 'express';
import multer from 'multer';
import { storage } from './repositories/index.js';
import { BookFormat } from '../shared/schema.js';
import { jwtAuth, requireActiveUser } from './jwt-middleware.js';
import crypto from 'node:crypto';
import { BookParserFactory } from './book-parser.js';
import type { BookMetadata, BookChapter } from './book-parser.js';
import { CryptoService } from './crypto-service.js';
import { fileStorage } from './file-storage.js';
import { duplicateDetectionService } from './duplicate-detection-service.js';
import { logger } from './lib/logger.js';
import { optimizeImage } from './image-optimizer.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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

type UploadMetadata = Partial<BookMetadata> & {
    coverImageData?: Buffer | string | null;
    coverImageType?: string | null;
};

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
        if (now.getTime() - session.createdAt.getTime() > 3600000) { // 1 hour
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
}, 3600000);

// 1. Initiate Upload
router.post('/upload', jwtAuth, requireActiveUser, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        const fileType = BookParserFactory.detectFileType(req.file.originalname);
        if (!fileType) {
            return res.status(400).json({ error: 'Unsupported file type. Only EPUB and FB2 are supported.' });
        }

        const parser = BookParserFactory.createParser(fileType);
        let metadata: UploadMetadata = {};

        try {
            const parsedBook = await parser.parseBook(req.file.buffer, req.file.originalname);
            metadata = parsedBook.metadata;
        } catch (e) {
            console.warn('Failed to parse book', e);
        }

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
        const tempKey = `temp/uploads/${sessionId}/${req.file.originalname}`;
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
        if (metadata.coverImageData && Buffer.isBuffer(metadata.coverImageData)) {
            const buffer = metadata.coverImageData;
            const type = metadata.coverImageType || 'image/jpeg';
            coverPreview = `data:${type};base64,${buffer.toString('base64')}`;
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
    let coverBuffer: Buffer | undefined;

    if (metadata.coverImageData && typeof metadata.coverImageData === 'string') {
        try {
            const matches = metadata.coverImageData.match(/^data:([A-Za-z+/-]+);base64,(.+)$/);
            if (matches?.length === 3) {
                coverBuffer = Buffer.from(matches[2], 'base64');
            } else {
                coverBuffer = Buffer.from(metadata.coverImageData, 'base64');
            }
        } catch (e) {
            console.warn('[PersonalBooks] Failed to parse cover image', e);
        }
    } else if (metadata.coverImageData === null) {
        coverBuffer = undefined;
    } else if (session.parsedMetadata.coverImageData) {
        coverBuffer = session.parsedMetadata.coverImageData;
    }

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

        // Determine format
        const fileType = BookParserFactory.detectFileType(session.originalName);
        if (!fileType) {
            return res.status(400).json({ error: 'Invalid file type' });
        }
        const format = fileType.toUpperCase() as BookFormat;

        // Download raw file from MinIO temp storage
        const fileBuffer = await fileStorage.getFile(session.tempStorageKey);

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

        // Clean up: delete temp file from MinIO and remove session
        try {
            await fileStorage.deleteFile(session.tempStorageKey);
        } catch (e) {
            console.warn(`[PersonalBooks] Failed to clean temp file ${session.tempStorageKey}:`, e);
        }
        uploadSessions.delete(sessionId);
        res.json(book);
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
                return {
                    ...book,
                    progress: progress?.progress || 0,
                    currentChapter: progress?.currentChapter || 1
                };
            } catch (error_) {
                console.warn('[PersonalBooks] Ошибка при обновлении прогресса:', error_);
                return {
                    ...book,
                    progress: 0,
                    currentChapter: 1
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

    res.json(book);
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
    type AllowedUpdate = typeof allowedUpdates[number];
    const filteredUpdates: Partial<Parameters<typeof storage.updatePersonalBook>[1]> = {};
    for (const key of allowedUpdates) {
        const value = updates[key];
        if (value !== undefined) {
            filteredUpdates[key] = value as never;
        }
    }

    const updatedBook = await storage.updatePersonalBook(req.params.id, filteredUpdates);
    res.json(updatedBook);
});

// Delete Book
router.delete('/:id', jwtAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const book = await storage.getPersonalBook(req.params.id);

    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    await storage.deletePersonalBook(req.params.id);
    bookCache.delete(req.params.id);
    res.json({ success: true });
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

export default router;
