import { Router } from 'express';
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

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// In-memory session store
interface UploadSession {
    userId: string;
    clubId: string;
    fileBuffer: Buffer;
    originalName: string;
    mimeType: string;
    parsedMetadata: UploadMetadata;
    createdAt: Date;
}

type UploadMetadata = Partial<BookMetadata> & {
    coverImageData?: Buffer | string | null;
    coverImageType?: string | null;
};

const uploadSessions = new Map<string, UploadSession>();

// Helper function to process cover image data
async function processCoverImage(
    metadata: UploadMetadata,
    session: UploadSession,
    clubId: string,
    sessionId: string
): Promise<string | undefined> {
    let coverBuffer: Buffer | undefined;

    if (metadata.coverImageData && typeof metadata.coverImageData === 'string') {
        try {
            const matches = metadata.coverImageData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
            if (matches?.length === 3) {
                coverBuffer = Buffer.from(matches[2], 'base64');
            } else {
                coverBuffer = Buffer.from(metadata.coverImageData, 'base64');
            }
        } catch (e) {
            console.warn('Failed to parse new cover image', e);
        }
    } else if (metadata.coverImageData === null) {
        coverBuffer = undefined;
    } else if (session.parsedMetadata.coverImageData) {
        coverBuffer = session.parsedMetadata.coverImageData;
    }

    if (coverBuffer) {
        try {
            // Оптимизируем обложку перед загрузкой
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
setInterval(() => {
    const now = new Date();
    for (const [id, session] of Array.from(uploadSessions.entries())) {
        if (now.getTime() - session.createdAt.getTime() > 3600000) { // 1 hour
            uploadSessions.delete(id);
        }
    }
}, 3600000);

// 1. Initiate Club Upload
router.post('/clubs/:clubId/books/upload', jwtAuth, requireActiveUser, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        const { clubId } = req.params;

        // Check if user is owner of the club (Moderator rights)
        const club = await storage.getClub(clubId);
        if (!club) return res.status(404).json({ error: 'Club not found' });

        if (club.ownerId !== req.user.id) {
            return res.status(403).json({ error: 'Only club owner can upload books' });
        }

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
            console.warn('Failed to parse metadata', e);
        }

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
        uploadSessions.set(sessionId, {
            userId: req.user.id,
            clubId,
            fileBuffer: req.file.buffer,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
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

// 2. Confirm Club Upload
router.post('/clubs/:clubId/books/upload/:sessionId/confirm', jwtAuth, requireActiveUser, async (req, res) => {
    try {
        const { clubId, sessionId } = req.params;
        const { metadata } = req.body;
        const session = uploadSessions.get(sessionId);

        if (!session) return res.status(404).json({ error: 'Session not found or expired' });
        if (session.userId !== req.user?.id) return res.status(403).json({ error: 'Forbidden' });
        if (session.clubId !== clubId) return res.status(400).json({ error: 'Session mismatch' });

        const fileHash = crypto.createHash('sha256').update(session.fileBuffer).digest('hex');
        const fileType = BookParserFactory.detectFileType(session.originalName);
        if (!fileType) {
            return res.status(400).json({ error: 'Invalid file type' });
        }
        const format = fileType.toUpperCase() as BookFormat;

        // Encrypt and upload book file
        const { storagePath, encryptedKey } = await encryptAndUploadBookFile(
            session.fileBuffer,
            clubId,
            sessionId
        );

        // Process cover image
        const coverUrl = await processCoverImage(metadata, session, clubId, sessionId);

        const book = await storage.createClubBook({
            clubId,
            uploadedByUserId: req.user.id,
            title: metadata.title || session.parsedMetadata.title || session.originalName,
            author: metadata.author || session.parsedMetadata.author || 'Unknown',
            description: metadata.description,
            format: format,
            fileHash,
            fileSizeBytes: session.fileBuffer.length,
            language: metadata.language,
            publicationYear: metadata.publicationYear ? Number.parseInt(metadata.publicationYear) : undefined,
            genre: metadata.genre,
            recommendedReadingOrder: metadata.recommendedReadingOrder ? Number.parseInt(metadata.recommendedReadingOrder) : undefined,
            encryptedContentKey: encryptedKey,
            storagePath: storagePath,
            coverUrl: coverUrl,
        });

        await storage.updateClub(clubId, { bookId: book.id });
        uploadSessions.delete(sessionId);
        res.json(book);
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
    res.json(books);
});

// Get Club Book
router.get('/clubs/:clubId/books/:bookId', jwtAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { clubId, bookId } = req.params;

    const book = await storage.getClubBook(bookId);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.clubId !== clubId) return res.status(404).json({ error: 'Book not found in this club' });

    res.json(book);
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
router.patch('/clubs/:clubId/books/:bookId', jwtAuth, requireActiveUser, async (req, res) => {
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

        const updatedBook = await storage.updateClubBook(bookId, {
            title,
            description,
            coverUrl,
            genre,
            language,
            publicationYear: publicationYear ? Number.parseInt(publicationYear) : undefined,
        });

        res.json(updatedBook);
    } catch (error) {
        console.error('Update club book error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
