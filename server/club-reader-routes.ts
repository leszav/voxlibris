import express from 'express';
import { jwtAuth } from './jwt-middleware.js';
import {
  clubBooks,
  clubMembers,
  readingProgress,
  clubReadingPlans,
  clubReadingPlanProgress,
  books,
  users,
  userProfiles,
  type ClubReadingPlan,
  type ClubReadingPlanProgress
} from '../shared/schema.js';
import { db } from './db.js';
import { eq, and, desc, asc, sql } from 'drizzle-orm';

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

/**
 * GET /api/clubs/:clubId/reading-plan
 * Получение плана чтения клуба
 */
router.get('/:clubId/reading-plan', jwtAuth, async (req, res) => {
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
      return res.status(404).json({ message: 'No book selected for this club', code: 'NO_BOOK_SELECTED' });
    }

    const plans = await db
      .select()
      .from(clubReadingPlans)
      .where(eq(clubReadingPlans.clubBookId, clubBook.id))
      .orderBy(asc(clubReadingPlans.orderIndex));

    const progress = await db
      .select()
      .from(clubReadingPlanProgress)
      .where(eq(clubReadingPlanProgress.userId, userId));

    res.json({
      clubBook,
      plan: plans,
      progress
    });
  } catch (error: any) {
    console.error('[Club Reader] Get reading plan error:', error);
    res.status(500).json({ message: 'Failed to get reading plan' });
  }
});

/**
 * POST /api/clubs/:clubId/reading-plan
 * Создание этапа плана чтения
 */
router.post('/:clubId/reading-plan', jwtAuth, async (req, res) => {
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

    if (member.role !== 'owner' && member.role !== 'moderator') {
      return res.status(403).json({ message: 'Only owner or moderator can create reading plans' });
    }

    const [clubBook] = await db
      .select()
      .from(clubBooks)
      .where(and(eq(clubBooks.clubId, clubId), eq(clubBooks.isDeleted, false)))
      .limit(1);

    if (!clubBook) {
      return res.status(404).json({ message: 'No book selected for this club', code: 'NO_BOOK_SELECTED' });
    }

    const { title, description, orderIndex, startChapter, endChapter, targetDate } = req.body;

    if (!title || orderIndex === undefined) {
      return res.status(400).json({ message: 'Title and orderIndex are required' });
    }

    const [newPlan] = await db
      .insert(clubReadingPlans)
      .values({
        clubBookId: clubBook.id,
        title,
        description,
        orderIndex,
        startChapter,
        endChapter,
        targetDate: targetDate ? new Date(targetDate) : null,
      })
      .returning();

    res.status(201).json(newPlan);
  } catch (error: any) {
    console.error('[Club Reader] Create reading plan error:', error);
    res.status(500).json({ message: 'Failed to create reading plan' });
  }
});

/**
 * PUT /api/clubs/:clubId/reading-plan/:planId
 * Обновление этапа плана чтения
 */
router.put('/:clubId/reading-plan/:planId', jwtAuth, async (req, res) => {
  try {
    const { clubId, planId } = req.params;
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

    if (member.role !== 'owner' && member.role !== 'moderator') {
      return res.status(403).json({ message: 'Only owner or moderator can update reading plans' });
    }

    const [existingPlan] = await db
      .select()
      .from(clubReadingPlans)
      .innerJoin(clubBooks, eq(clubReadingPlans.clubBookId, clubBooks.id))
      .where(and(
        eq(clubReadingPlans.id, planId),
        eq(clubBooks.clubId, clubId)
      ))
      .limit(1);

    if (!existingPlan) {
      return res.status(404).json({ message: 'Reading plan not found' });
    }

    const { title, description, orderIndex, startChapter, endChapter, targetDate } = req.body;

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (orderIndex !== undefined) updates.orderIndex = orderIndex;
    if (startChapter !== undefined) updates.startChapter = startChapter;
    if (endChapter !== undefined) updates.endChapter = endChapter;
    if (targetDate !== undefined) updates.targetDate = new Date(targetDate);

    const [updatedPlan] = await db
      .update(clubReadingPlans)
      .set(updates)
      .where(eq(clubReadingPlans.id, planId))
      .returning();

    res.json(updatedPlan);
  } catch (error: any) {
    console.error('[Club Reader] Update reading plan error:', error);
    res.status(500).json({ message: 'Failed to update reading plan' });
  }
});

/**
 * DELETE /api/clubs/:clubId/reading-plan/:planId
 * Удаление этапа плана чтения
 */
router.delete('/:clubId/reading-plan/:planId', jwtAuth, async (req, res) => {
  try {
    const { clubId, planId } = req.params;
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

    if (member.role !== 'owner' && member.role !== 'moderator') {
      return res.status(403).json({ message: 'Only owner or moderator can delete reading plans' });
    }

    const [existingPlan] = await db
      .select()
      .from(clubReadingPlans)
      .innerJoin(clubBooks, eq(clubReadingPlans.clubBookId, clubBooks.id))
      .where(and(
        eq(clubReadingPlans.id, planId),
        eq(clubBooks.clubId, clubId)
      ))
      .limit(1);

    if (!existingPlan) {
      return res.status(404).json({ message: 'Reading plan not found' });
    }

    await db.delete(clubReadingPlanProgress).where(eq(clubReadingPlanProgress.planId, planId));
    await db.delete(clubReadingPlans).where(eq(clubReadingPlans.id, planId));

    res.json({ success: true, message: 'Reading plan deleted' });
  } catch (error: any) {
    console.error('[Club Reader] Delete reading plan error:', error);
    res.status(500).json({ message: 'Failed to delete reading plan' });
  }
});

/**
 * GET /api/clubs/:clubId/members-progress
 * Получение прогресса всех участников клуба
 */
router.get('/:clubId/members-progress', jwtAuth, async (req, res) => {
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
      return res.status(404).json({ message: 'No book selected for this club', code: 'NO_BOOK_SELECTED' });
    }

    const clubMembersList = await db
      .select({
        userId: clubMembers.userId,
        role: clubMembers.role,
      })
      .from(clubMembers)
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.isActive, true)));

    const progressData = await db
      .select()
      .from(readingProgress)
      .where(eq(readingProgress.bookId, clubBook.id));

    const userIds = clubMembersList.map((m: { userId: string }) => m.userId);
    const usersData = await db
      .select()
      .from(users)
      .where(sql`${users.id} IN ${userIds}`);

    const profilesData = await db
      .select()
      .from(userProfiles)
      .where(sql`${userProfiles.userId} IN ${userIds}`);

    const result = clubMembersList.map((member: { userId: string; role: string }) => {
      const user = usersData.find((u: { id: string }) => u.id === member.userId);
      const profile = profilesData.find((p: { userId: string }) => p.userId === member.userId);
      const progress = progressData.find((p: { userId: string }) => p.userId === member.userId);

      return {
        userId: member.userId,
        username: user?.username || 'Unknown',
        displayName: profile?.displayName || user?.username || 'Unknown',
        role: member.role,
        currentChapter: progress?.currentChapter || 0,
        currentPosition: progress?.currentPosition || "0",
        progress: progress?.progress || 0,
        lastReadAt: progress?.lastReadAt || null,
      };
    });

    res.json(result);
  } catch (error: any) {
    console.error('[Club Reader] Get members progress error:', error);
    res.status(500).json({ message: 'Failed to get members progress' });
  }
});

export default router;