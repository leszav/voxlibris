import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { storage } from './repositories/index.js';
import { BookFormat } from '../shared/schema.js';
import { jwtAuth, requireActiveUser } from './jwt-middleware.js';
import crypto from 'node:crypto';
import { BookParserFactory } from './book-parser.js';
import type { BookMetadata } from './book-parser.js';
import { CryptoService } from './crypto-service.js';
import { fileStorage } from './file-storage.js';
import { duplicateDetectionService } from './duplicate-detection-service.js';
import { logger } from './lib/logger.js';
import { optimizeImage } from './image-optimizer.js';
import { storeOptimizedImageIfNeeded } from './lib/uploaded-image-storage.js';
import { genreService } from './services/genre-service.js';
import { serializeClubBook } from './lib/client-serializers.js';

const router = Router();

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeUploadFileName(fileName: string): string {
    return fileName.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
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

// In-memory session store
interface UploadSession {
    userId: string;
    clubId: string;
    tempStorageKey: string;
    fileSize: number;
    originalName: string;
    mimeType: string;
    parsedMetadata: UploadMetadata;
    createdAt: Date;
}

type UploadMetadata = Omit<Partial<BookMetadata>, 'coverImageData' | 'coverImageType'> & {
    coverImageData?: Buffer | string | null;
    coverImageType?: string | null;
    publicationYear?: string | number;
    genre?: string;
    recommendedReadingOrder?: string | number;
};

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

const uploadSessions = new Map<string, UploadSession>();

// Helper function to extract cover buffer from various sources
function extractCoverBuffer(metadata: UploadMetadata, session: UploadSession): Buffer | undefined {
    // Try new metadata first
    if (metadata.coverImageData && typeof metadata.coverImageData === 'string') {
        try {
            const matches = metadata.coverImageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
            if (matches?.length === 3) {
                return Buffer.from(matches[2], 'base64');
            }
            return Buffer.from(metadata.coverImageData, 'base64');
        } catch (e) {
            console.warn('Failed to parse new cover image', e);
        }
    }
    
    if (metadata.coverImageData === null) {
        return undefined;
    }
    
    // Fallback to session metadata
    if (typeof session.parsedMetadata.coverImageData === 'string') {
        try {
            const matches = session.parsedMetadata.coverImageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
            if (matches?.length === 3) {
                return Buffer.from(matches[2], 'base64');
            }
            return Buffer.from(session.parsedMetadata.coverImageData, 'base64');
        } catch (e) {
            console.warn('Failed to parse cached cover image', e);
        }
    }
    
    if (Buffer.isBuffer(session.parsedMetadata.coverImageData)) {
        return session.parsedMetadata.coverImageData;
    }
    
    return undefined;
}

// Helper function to upload optimized cover
async function uploadOptimizedCover(
    coverBuffer: Buffer,
    clubId: string,
    sessionId: string
): Promise<string | undefined> {
    try {
        const optimized = await optimizeImage(coverBuffer, 'cover');
        const coverPath = `covers/club/${clubId}/${sessionId}-cover.webp`;
        
        logger.info({ 
            coverPath, 
            originalSize: optimized.originalSize,
            optimizedSize: optimized.optimizedSize,
            compressionRatio: optimized.compressionRatio 
        }, '[ClubBooks] Uploading optimized cover');
        
        const coverResult = await fileStorage.uploadFile(
            optimized.buffer, 
            coverPath, 
            optimized.mimeType
        );
        const coverUrl = `/api/storage/${coverResult.key}`;
        logger.info({ key: coverResult.key, url: coverUrl }, '[ClubBooks] Cover uploaded');
        return coverUrl;
    } catch (e) {
        logger.error({ error: e }, '[ClubBooks] Failed to upload cover');
    }
    return undefined;
}

// Helper function to process cover image data
async function processCoverImage(
    metadata: UploadMetadata,
    session: UploadSession,
    clubId: string,
    sessionId: string
): Promise<string | undefined> {
    const coverBuffer = extractCoverBuffer(metadata, session);
    
    if (coverBuffer) {
        return uploadOptimizedCover(coverBuffer, clubId, sessionId);
    }
    
    return undefined;
}

// Helper function to encrypt and upload book file
async function encryptAndUploadBookFile(
    fileBuffer: Buffer,
    clubId: string,
    sessionId: string
): Promise<{ storagePath: string; encryptedKey: string }> {
    const cek = CryptoService.generateKey();
    const encryptedFile = CryptoService.encryptFile(fileBuffer, cek);
    const encryptedKey = CryptoService.encryptKey(cek);
    const storagePath = `club/${clubId}/${sessionId}.enc`;
    
    await fileStorage.uploadFile(encryptedFile, storagePath, 'application/octet-stream');
    
    return { storagePath, encryptedKey };
}

// Clean up old sessions periodically
setInterval(async () => {
    const now = new Date();
    for (const [id, session] of Array.from(uploadSessions.entries())) {
        if (now.getTime() - session.createdAt.getTime() > UPLOAD_SESSION_TTL_MS) {
            try {
                await fileStorage.deleteFile(session.tempStorageKey);
            } catch (error) {
                logger.warn({ error, key: session.tempStorageKey }, '[ClubBooks] Failed to delete expired temp upload file');
            }
            uploadSessions.delete(id);
        }
    }
}, UPLOAD_SESSION_CLEANUP_INTERVAL_MS);

// 1. Initiate Club Upload
router.post('/clubs/:clubId/books/upload', jwtAuth, requireActiveUser, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        const { clubId } = req.params;

        if (uploadSessions.size >= MAX_ACTIVE_UPLOAD_SESSIONS) {
            return res.status(429).json({ error: 'Too many active upload sessions. Please try again later.' });
        }

        const activeSessionsForUser = Array.from(uploadSessions.values()).filter(
            (session) => session.userId === req.user?.id,
        ).length;

        if (activeSessionsForUser >= MAX_ACTIVE_UPLOAD_SESSIONS_PER_USER) {
            return res.status(429).json({ error: 'Too many active uploads for this user. Complete or wait for previous uploads to expire.' });
        }

        // Check if user is owner of the club (Moderator rights)
        const club = await storage.getClub(clubId);
        if (!club) return res.status(404).json({ error: 'Club not found' });

        if (club.ownerId !== req.user.id) {
            return res.status(403).json({ error: 'Only club owner can upload books' });
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
            console.warn('Failed to parse metadata', e);
        }

        metadata = normalizeUploadMetadata(metadata);
        metadata = await enrichUploadMetadataWithGenreLabels(metadata);

        // Проверка дубликатов в клубной библиотеке
        const title = metadata.title || req.file.originalname;
        const author = metadata.author || 'Unknown';
        
        const duplicates = await duplicateDetectionService.findClubBookDuplicates(
            clubId,
            title,
            author,
            85 // порог схожести 85%
        );

        const sessionId = crypto.randomUUID();
        const safeOriginalName = sanitizeUploadFileName(req.file.originalname);
        const tempStorageKey = `temp/club-uploads/${sessionId}/${safeOriginalName}`;
        await fileStorage.uploadFile(req.file.buffer, tempStorageKey, req.file.mimetype);

        uploadSessions.set(sessionId, {
            userId: req.user.id,
            clubId,
            tempStorageKey,
            fileSize: req.file.buffer.length,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
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

        // Remove raw buffer from metadata
        const { coverImageData: _coverImageData, ...cleanMetadata } = metadata;

        res.json({
            sessionId,
            metadata: {
                title: cleanMetadata.title || req.file.originalname,
                author: cleanMetadata.author || 'Unknown',
                description: cleanMetadata.description,
                language: cleanMetadata.language,
                coverPreview,
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
        console.error('Club upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to validate upload session
function validateUploadSession(
    session: UploadSession | undefined,
    userId: string,
    clubId: string
): { valid: boolean; error?: string; status?: number } {
    if (!session) {
        return { valid: false, error: 'Session not found or expired', status: 404 };
    }
    if (session.userId !== userId) {
        return { valid: false, error: 'Forbidden', status: 403 };
    }
    if (session.clubId !== clubId) {
        return { valid: false, error: 'Session mismatch', status: 400 };
    }
    return { valid: true };
}

interface ClubBookDataParams {
    clubId: string;
    userId: string;
    fileHash: string;
    format: BookFormat;
    session: UploadSession;
    metadata: UploadMetadata;
    storagePath: string;
    encryptedKey: string;
    coverUrl: string | undefined;
}

// Helper function to build club book creation data
function buildClubBookData(params: ClubBookDataParams) {
    const { clubId, userId, fileHash, format, session, metadata, storagePath, encryptedKey, coverUrl } = params;
    
    return {
        clubId,
        uploadedByUserId: userId,
        title: metadata.title || session.parsedMetadata.title || session.originalName,
        author: metadata.author || session.parsedMetadata.author || 'Unknown',
        description: metadata.description,
        format,
        fileHash,
        fileSizeBytes: session.fileSize,
        language: metadata.language,
        publicationYear: metadata.publicationYear ? Number.parseInt(String(metadata.publicationYear)) : undefined,
        genre: metadata.genre,
        recommendedReadingOrder: metadata.recommendedReadingOrder ? Number.parseInt(String(metadata.recommendedReadingOrder)) : undefined,
        encryptedContentKey: encryptedKey,
        storagePath,
        coverUrl,
    };
}

// 2. Confirm Club Upload
router.post('/clubs/:clubId/books/upload/:sessionId/confirm', jwtAuth, requireActiveUser, async (req, res) => {
    try {
        const { clubId, sessionId } = req.params;
        const { metadata } = req.body;
        const session = uploadSessions.get(sessionId);

        const validation = validateUploadSession(session, req.user!.id, clubId);
        if (!validation.valid) {
            return res.status(validation.status!).json({ error: validation.error });
        }

        const fileBuffer = await fileStorage.getFile(session!.tempStorageKey);
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        const fileType = await BookParserFactory.detectFileTypeFromBuffer(fileBuffer, session!.originalName);
        if (!fileType) {
            return res.status(400).json({ error: 'Invalid or unsupported file type' });
        }
        const format = fileType.toUpperCase() as BookFormat;

        const { storagePath, encryptedKey } = await encryptAndUploadBookFile(fileBuffer, clubId, sessionId);
        const coverUrl = await processCoverImage(metadata, session!, clubId, sessionId);

        const bookData = buildClubBookData({
            clubId,
            userId: req.user!.id,
            fileHash,
            format,
            session: session!,
            metadata,
            storagePath,
            encryptedKey,
            coverUrl,
        });

        const book = await storage.createClubBook(bookData);
        const genreInput = [metadata.genre, ...(Array.isArray(metadata.genres) ? metadata.genres : [])]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

        const persistedGenres = await genreService.persistBookGenres('club', book.id, genreInput, 'metadata');
        const bookWithGenres = await storage.updateClubBook(book.id, {
            primaryGenreId: persistedGenres.primaryGenreId ?? undefined,
            genre: persistedGenres.legacyGenre ?? undefined,
        });

        await storage.updateClub(clubId, { bookId: book.id });

        try {
            await fileStorage.deleteFile(session!.tempStorageKey);
        } catch (error) {
            logger.warn({ error, key: session!.tempStorageKey }, '[ClubBooks] Failed to delete temp upload file after confirm');
        }

        uploadSessions.delete(sessionId);
        if (!bookWithGenres) {
            return res.status(500).json({ error: 'Failed to persist genres for uploaded book' });
        }

        const genresPayload = await genreService.getBookGenresPayload('club', book.id);
        res.json({
            ...serializeClubBook(bookWithGenres),
            primaryGenre: genresPayload.primaryGenre,
            genres: genresPayload.genres,
        });
    } catch (error) {
        console.error('Club confirm upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to check if user can delete book
async function canUserDeleteBook(
    clubId: string,
    userId: string,
    uploadedByUserId: string
): Promise<{ canDelete: boolean; error?: string }> {
    const membersWithRoles = await storage.getClubMembersWithRoles(clubId);
    const membership = membersWithRoles.find((m) => m.id === userId);
    
    if (!membership) {
        return { canDelete: false, error: 'You are not a member of this club' };
    }

    const canDelete = membership.role === 'owner' || 
                      membership.role === 'moderator' || 
                      uploadedByUserId === userId;

    if (!canDelete) {
        return { canDelete: false, error: 'You do not have permission to delete this book' };
    }

    return { canDelete: true };
}

// Helper function to delete book files from storage
async function deleteBookFiles(book: { storagePath: string; coverUrl: string | null }): Promise<void> {
    if (book.storagePath) {
        try {
            await fileStorage.deleteFile(book.storagePath);
            logger.info({ storagePath: book.storagePath }, 'Deleted club book file from storage');
        } catch (fileError) {
            console.warn(`Failed to delete club book file from storage: ${book.storagePath}`, fileError);
        }
    }

    if (book.coverUrl) {
        try {
            const coverKey = book.coverUrl.replace('/api/storage/', '');
            if (coverKey && coverKey !== book.coverUrl) {
                await fileStorage.deleteFile(coverKey);
                logger.info({ coverKey }, 'Deleted club book cover from storage');
            }
        } catch (coverError) {
            console.warn(`Failed to delete club book cover from storage`, coverError);
        }
    }
}

// List Club Books
router.get('/clubs/:clubId/books', jwtAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { clubId } = req.params;

    const books = await storage.getClubBooksByClub(clubId);
    const booksWithGenres = await Promise.all(
        books.map(async (book) => {
            const genresPayload = await genreService.getBookGenresPayload('club', book.id);
            return {
                ...serializeClubBook(book),
                primaryGenre: genresPayload.primaryGenre,
                genres: genresPayload.genres,
            };
        }),
    );
    res.json(booksWithGenres);
});

// Get Club Book
router.get('/clubs/:clubId/books/:bookId', jwtAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { clubId, bookId } = req.params;

    const book = await storage.getClubBook(bookId);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.clubId !== clubId) return res.status(404).json({ error: 'Book not found in this club' });

    const genresPayload = await genreService.getBookGenresPayload('club', book.id);
    res.json({
        ...serializeClubBook(book),
        primaryGenre: genresPayload.primaryGenre,
        genres: genresPayload.genres,
    });
});

// Delete Club Book
router.delete('/clubs/:clubId/books/:bookId', jwtAuth, requireActiveUser, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { clubId, bookId } = req.params;

        const book = await storage.getClubBook(bookId);
        if (!book) return res.status(404).json({ error: 'Book not found' });
        if (book.clubId !== clubId) return res.status(404).json({ error: 'Book not found in this club' });

        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const permissionCheck = await canUserDeleteBook(clubId, userId, book.uploadedByUserId);
        if (!permissionCheck.canDelete) {
            return res.status(403).json({ error: permissionCheck.error });
        }

        await deleteBookFiles(book);
        await storage.deleteClubBook(bookId);
        
        res.json({ success: true, message: 'Book deleted successfully' });
    } catch (error) {
        console.error('Delete club book error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update Club Book
router.patch('/clubs/:clubId/books/:bookId', jwtAuth, requireActiveUser, upload.single('cover'), async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { clubId, bookId } = req.params;
        const { title, description, coverUrl, genre, language, publicationYear } = req.body;

        const book = await storage.getClubBook(bookId);
        if (!book) return res.status(404).json({ error: 'Book not found' });
        if (book.clubId !== clubId) return res.status(404).json({ error: 'Book not found in this club' });

        const membersWithRoles = await storage.getClubMembersWithRoles(clubId);
        const membership = membersWithRoles.find((m) => m.id === req.user?.id);
        if (!membership) return res.status(403).json({ error: 'You are not a member of this club' });

        const canEdit = membership.role === 'owner' || membership.role === 'moderator' || book.uploadedByUserId === req.user?.id;
        if (!canEdit) return res.status(403).json({ error: 'You do not have permission to edit this book' });

        const normalizedCoverUrl = req.file
            ? await uploadOptimizedCover(req.file.buffer, clubId, `${bookId}-${crypto.randomUUID()}`)
            : await storeOptimizedImageIfNeeded(coverUrl, {
                type: 'cover',
                keyPrefix: `covers/club/${clubId}/manual`,
                filenamePrefix: bookId,
            });

        const updatePayload = {
            title,
            description,
            coverUrl: normalizedCoverUrl,
            genre,
            language,
            publicationYear: publicationYear ? Number.parseInt(publicationYear, 10) : undefined,
        };

        Object.keys(updatePayload).forEach((key) => {
            if (updatePayload[key as keyof typeof updatePayload] === undefined) {
                delete updatePayload[key as keyof typeof updatePayload];
            }
        });

        const updatedBook = await storage.updateClubBook(bookId, updatePayload);
        if (!updatedBook) return res.status(404).json({ error: 'Book not found' });

        const bodyGenres = typeof req.body.genres === 'string'
            ? JSON.parse(req.body.genres) as unknown
            : req.body.genres;
        const genreInput = [req.body.genre, ...(Array.isArray(bodyGenres) ? bodyGenres : [])]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

        const persistedGenres = await genreService.persistBookGenres('club', bookId, genreInput, 'manual');
        const enrichedBook = await storage.updateClubBook(bookId, {
            primaryGenreId: persistedGenres.primaryGenreId ?? undefined,
            genre: persistedGenres.legacyGenre ?? undefined,
        });

        if (!enrichedBook) return res.status(404).json({ error: 'Book not found' });

        const genresPayload = await genreService.getBookGenresPayload('club', bookId);

        res.json({
            ...serializeClubBook(enrichedBook),
            primaryGenre: genresPayload.primaryGenre,
            genres: genresPayload.genres,
        });
    } catch (error) {
        console.error('Update club book error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/clubs/:clubId/active-book', jwtAuth, requireActiveUser, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { clubId } = req.params;
        const { bookId } = req.body as { bookId?: string };

        if (!bookId) return res.status(400).json({ error: 'bookId is required' });

        const membersWithRoles = await storage.getClubMembersWithRoles(clubId);
        const membership = membersWithRoles.find((m) => m.id === req.user?.id);
        if (membership?.role !== 'owner') {
            return res.status(403).json({ error: 'Only the club owner can change the active book' });
        }

        const book = await storage.getClubBook(bookId);
        if (!book || book.clubId !== clubId || book.isDeleted) {
            return res.status(404).json({ error: 'Book not found in this club' });
        }

        await storage.updateClub(clubId, { bookId });
        res.json({ success: true });
    } catch (error) {
        console.error('Set active book error:', error);
        res.status(500).json({ error: 'Internal server error' });
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
