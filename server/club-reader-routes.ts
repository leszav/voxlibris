import express from 'express';
import { jwtAuth } from './jwt-middleware';
import {
  clubBooks,
  clubMembers,
  readingProgress
} from '@shared/schema';
import { db } from './db';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

/**
 * PUT /api/clubs/:clubId/progress
 * Обновление прогресса чтения участника
 */
/**
 * GET /api/clubs/:clubId/progress
 * Получение прогресса чтения участника
 */
router.get('/:clubId/progress', jwtAuth, async (req, res) => {
  try {
    const { clubId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [member] = await db
      .select()
      .from(clubMembers)
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
      .limit(1);

    if (!member) {
      return res.status(403).json({ message: 'Not a member of this club' });
    }

    const [clubBook] = await db
      .select()
      .from(clubBooks)
      .where(and(eq(clubBooks.clubId, clubId), eq(clubBooks.isDeleted, false)))
      .limit(1);

    if (!clubBook) {
      return res.status(404).json({ message: 'No active book for this club' });
    }

    // Получаем индивидуальный прогресс
    const [userProgress] = await db
      .select()
      .from(readingProgress)
      .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, clubBook.id)))
      .limit(1);

    // Получаем прогресс админа клуба (рекомендуемый прогресс клуба)
    const [adminProgress] = await db
      .select({
        currentChapter: readingProgress.currentChapter,
        currentPosition: readingProgress.currentPosition,
        progress: readingProgress.progress
      })
      .from(readingProgress)
      .innerJoin(clubMembers, eq(readingProgress.userId, clubMembers.userId))
      .where(and(
        eq(clubMembers.clubId, clubId),
        eq(clubMembers.role, 'owner'),
        eq(readingProgress.bookId, clubBook.id)
      ))
      .limit(1);

    res.json({ 
      success: true, 
      userProgress: userProgress || {
        currentChapter: 0,
        currentPosition: "0",
        progress: 0
      },
      clubProgress: adminProgress || {
        currentChapter: 0,
        currentPosition: "0", 
        progress: 0
      }
    });
  } catch (error: any) {
    console.error('[Club Reader] Get progress error:', error);
    res.status(500).json({ message: 'Failed to get progress' });
  }
});

router.put('/:clubId/progress', jwtAuth, async (req, res) => {
  try {
    const { clubId } = req.params;
    const userId = req.user?.id;
    const { currentChapter, currentPosition, progress } = req.body;

    console.log('[Club Reader] Progress update request:', {
      clubId,
      userId,
      currentChapter,
      currentPosition,
      progress
    });

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [member] = await db
      .select()
      .from(clubMembers)
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
      .limit(1);

    if (!member) {
      return res.status(403).json({ message: 'Not a member of this club' });
    }

    const [clubBook] = await db
      .select()
      .from(clubBooks)
      .where(and(eq(clubBooks.clubId, clubId), eq(clubBooks.isDeleted, false)))
      .limit(1);

    if (!clubBook) {
      return res.status(404).json({ message: 'No active book for this club' });
    }

    // Простой upsert подход - сначала удаляем старую запись если есть
    await db.delete(readingProgress)
      .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, clubBook.id)));
    
    // Вставляем новую запись
    await db.insert(readingProgress)
      .values({
        userId,
        bookId: clubBook.id, // Используем ID клубной книги
        clubId: clubId, // Сохраняем и ID клуба
        currentChapter,
        currentPosition: typeof currentPosition === 'string' ? currentPosition : JSON.stringify(currentPosition),
        progress,
        lastReadAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    
    console.log('[Club Reader] Progress saved successfully');

    // Возвращаем обновленный прогресс включая клубный
    const [adminProgress] = await db
      .select({
        currentChapter: readingProgress.currentChapter,
        currentPosition: readingProgress.currentPosition,
        progress: readingProgress.progress
      })
      .from(readingProgress)
      .innerJoin(clubMembers, eq(readingProgress.userId, clubMembers.userId))
      .where(and(
        eq(clubMembers.clubId, clubId),
        eq(clubMembers.role, 'owner'),
        eq(readingProgress.bookId, clubBook.id)
      ))
      .limit(1);

    res.json({ 
      success: true,
      userProgress: {
        currentChapter,
        currentPosition: typeof currentPosition === 'string' ? currentPosition : JSON.stringify(currentPosition),
        progress
      },
      clubProgress: adminProgress || {
        currentChapter: 0,
        currentPosition: "0",
        progress: 0
      }
    });
  } catch (error: any) {
    console.error('[Club Reader] Update progress error:', error);
    res.status(500).json({ message: 'Failed to update progress' });
  }
});

/**
 * GET /api/clubs/:clubId/books/:bookId/content
 * Получение контента клубной книги
 */
router.get('/:clubId/books/:bookId/content', jwtAuth, async (req, res) => {
  try {
    const { clubId, bookId } = req.params;
    const { chapter } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Проверяем членство в клубе
    const [member] = await db
      .select()
      .from(clubMembers)
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
      .limit(1);

    if (!member) {
      return res.status(403).json({ error: "Not a member of this club" });
    }

    // Получаем клубную книгу
    const [clubBook] = await db
      .select()
      .from(clubBooks)
      .where(and(eq(clubBooks.id, bookId), eq(clubBooks.clubId, clubId), eq(clubBooks.isDeleted, false)))
      .limit(1);

    if (!clubBook) {
      return res.status(404).json({ error: "Book not found" });
    }

    // Используем CryptoService и BookParserFactory как в оригинальной задумке
    const { CryptoService } = await import('./crypto-service');
    const { fileStorage } = await import('./file-storage');
    const { BookParserFactory } = await import('./book-parser');
    const { sanitizeBookContent } = await import('./content-sanitizer');

    // Получаем зашифрованный файл из MinIO
    const encryptedFile = await fileStorage.getFile(clubBook.storagePath);

    // Расшифровываем ключ
    const cek = CryptoService.decryptKey(clubBook.encryptedContentKey!);
    
    // Расшифровываем файл
    const decryptedFile = CryptoService.decryptFile(encryptedFile, cek);
    
    // Парсим книгу чтобы получить главы
    const format = clubBook.format.toLowerCase() as 'fb2' | 'epub';
    const parser = BookParserFactory.createParser(format);
    const parsedBook = await parser.parseBook(decryptedFile, `book.${format}`);
    
    // Если запрошена конкретная глава
    if (chapter !== undefined) {
      const chapterNum = Number.parseInt(chapter as string, 10);
      
      if (!parsedBook.chapters || chapterNum < 1 || chapterNum > parsedBook.chapters.length) {
        return res.status(404).json({ error: 'Chapter not found' });
      }
      
      const chapterData = parsedBook.chapters.find(ch => ch.chapterNumber === chapterNum);
      if (!chapterData) {
        return res.status(404).json({ error: 'Chapter not found' });
      }
      
      // Санитизируем контент главы
      const sanitizedContent = sanitizeBookContent(chapterData.content);
      
      return res.json({
        title: clubBook.title,
        content: sanitizedContent,
        chapter: chapterNum,
        totalChapters: parsedBook.chapters.length,
        chapters: parsedBook.chapters.map((ch: any) => ({
          chapterNumber: ch.chapterNumber,
          title: ch.title
        }))
      });
    }

    // Возвращаем оглавление и базовую информацию
    res.json({
      title: clubBook.title,
      author: clubBook.author,
      chapters: parsedBook.chapters?.map((ch: any) => ({
        chapterNumber: ch.chapterNumber,
        title: ch.title
      })) || [],
      totalChapters: parsedBook.chapters?.length || 1
    });
  } catch (error: any) {
    console.error('[Club Reader] Get content error:', error);
    res.status(500).json({ message: 'Failed to get content' });
  }
});

export default router;