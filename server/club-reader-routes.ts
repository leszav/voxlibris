import express from 'express';
import { jwtAuth } from './jwt-middleware.js';
import {
  clubs,
  clubBooks,
  clubMembers,
  readingProgress,
  clubReadingPlans,
  clubReadingPlanProgress,
  users,
  userProfiles,
  chatMessages,
} from '../shared/schema.js';
import { db } from './db.js';
import { eq, and, asc, lt, isNotNull, inArray } from 'drizzle-orm';
import { logger } from './lib/logger.js';
import { syncBookReadingStatus } from './lib/sync-reading-status.js';

const router = express.Router();

const READER_LED_BOOK_ACCESS_DENIED = 'Reader-led club book is available only to the club reader';

function canAccessReaderLedBook(
  club: { type: string; ownerId: string },
  member: { role: string },
  userId: string,
): boolean {
  if (club.type !== 'reader-led') {
    return true;
  }

  return club.ownerId === userId || member.role === 'owner';
}

async function getClubBookAccessContext(clubId: string, userId: string) {
  const [club] = await db
    .select({ id: clubs.id, type: clubs.type, ownerId: clubs.ownerId })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);

  if (!club) {
    return { club: null, member: null };
  }

  const [member] = await db
    .select({ id: clubMembers.id, role: clubMembers.role, isActive: clubMembers.isActive })
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId), eq(clubMembers.isActive, true)))
    .limit(1);

  return { club, member: member ?? null };
}

function sendReaderLedBookAccessDenied(res: express.Response) {
  return res.status(403).json({
    message: READER_LED_BOOK_ACCESS_DENIED,
    code: 'READER_LED_BOOK_ACCESS_DENIED',
  });
}

/** Возвращает активную книгу клуба через clubs.bookId (детерминированный запрос) */
async function findClubActiveBook(clubId: string) {
  const [club] = await db
    .select({ bookId: clubs.bookId })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);

  if (!club?.bookId) return null;

  const [book] = await db
    .select()
    .from(clubBooks)
    .where(and(eq(clubBooks.id, club.bookId), eq(clubBooks.isDeleted, false)))
    .limit(1);

  return book ?? null;
}

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

    const { club, member } = await getClubBookAccessContext(clubId, userId);

    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (!member) {
      return res.status(403).json({ message: 'Not a member of this club' });
    }

    if (!canAccessReaderLedBook(club, member, userId)) {
      return sendReaderLedBookAccessDenied(res);
    }

    const clubBook = await findClubActiveBook(clubId);

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
  } catch (error: unknown) {
    console.error('[Club Reader] Get progress error:', error);
    res.status(500).json({ message: 'Failed to get progress' });
  }
});

router.put('/:clubId/progress', jwtAuth, async (req, res) => {
  try {
    const { clubId } = req.params;
    const userId = req.user?.id;
    const { currentChapter, currentPosition, progress } = req.body;

    logger.debug(
      { clubId, userId, currentChapter, currentPosition, progress },
      '[Club Reader] Progress update request'
    );

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { club, member } = await getClubBookAccessContext(clubId, userId);

    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (!member) {
      return res.status(403).json({ message: 'Not a member of this club' });
    }

    if (!canAccessReaderLedBook(club, member, userId)) {
      return sendReaderLedBookAccessDenied(res);
    }

    const clubBook = await findClubActiveBook(clubId);

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
    
    logger.debug('[Club Reader] Progress saved successfully');

    // Синхронизируем статус чтения (единый механизм с WebSocket-ридером)
    try {
      await syncBookReadingStatus({
        userId,
        bookId: clubBook.id,
        bookType: 'club',
        progress,
      });
    } catch (syncErr) {
      logger.error({ error: syncErr }, '[Club Reader] Failed to sync book_reading_status');
    }

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
  } catch (error: unknown) {
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

    const { club, member } = await getClubBookAccessContext(clubId, userId);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    if (!member) {
      return res.status(403).json({ error: "Not a member of this club" });
    }

    if (!canAccessReaderLedBook(club, member, userId)) {
      return res.status(403).json({
        error: READER_LED_BOOK_ACCESS_DENIED,
        code: 'READER_LED_BOOK_ACCESS_DENIED',
      });
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
    const { CryptoService } = await import('./crypto-service.js');
    const { fileStorage } = await import('./file-storage.js');
    const { BookParserFactory } = await import('./book-parser.js');
    const { sanitizeBookContent } = await import('./content-sanitizer.js');

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
        chapters: parsedBook.chapters.map((ch) => ({
          chapterNumber: ch.chapterNumber,
          title: ch.title
        }))
      });
    }

    // Возвращаем оглавление и базовую информацию
    res.json({
      title: clubBook.title,
      author: clubBook.author,
      chapters: parsedBook.chapters?.map((ch) => ({
        chapterNumber: ch.chapterNumber,
        title: ch.title
      })) || [],
      totalChapters: parsedBook.chapters?.length || 1
    });
  } catch (error: unknown) {
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

    const { club, member } = await getClubBookAccessContext(clubId, userId);

    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (!member) {
      return res.status(403).json({ message: 'Not a member of this club' });
    }

    if (!canAccessReaderLedBook(club, member, userId)) {
      return sendReaderLedBookAccessDenied(res);
    }

    const clubBook = await findClubActiveBook(clubId);

    if (!clubBook) {
      return res.status(404).json({ message: 'No book selected for this club', code: 'NO_BOOK_SELECTED' });
    }

    const plans = await db
      .select()
      .from(clubReadingPlans)
      .where(eq(clubReadingPlans.clubBookId, clubBook.id))
      .orderBy(asc(clubReadingPlans.orderIndex));

    // Получаем текущий прогресс чтения пользователя
    const [userProgress] = await db
      .select()
      .from(readingProgress)
      .where(and(eq(readingProgress.userId, userId), eq(readingProgress.bookId, clubBook.id)))
      .limit(1);

    const currentChapter = userProgress?.currentChapter || 0;

    // Получаем сохраненные статусы
    const savedProgress = await db
      .select()
      .from(clubReadingPlanProgress)
      .where(eq(clubReadingPlanProgress.userId, userId));

    const savedProgressMap = new Map(savedProgress.map(p => [p.planId, p.status]));

    // Автоматически определяем статусы на основе прогресса чтения
    const progressWithStatus = plans.map(plan => {
      const savedStatus = savedProgressMap.get(plan.id);
      
      // Если статус сохранен вручную, используем его
      if (savedStatus) {
        return {
          planId: plan.id,
          userId,
          status: savedStatus,
          updatedAt: new Date()
        };
      }

      // Автоматическое определение статуса на основе глав
      let autoStatus: 'not_started' | 'in_progress' | 'completed' = 'not_started';
      
      if (plan.startChapter !== null && plan.endChapter !== null && currentChapter > 0) {
        if (currentChapter >= plan.endChapter) {
          autoStatus = 'completed';
        } else if (currentChapter >= plan.startChapter) {
          autoStatus = 'in_progress';
        }
      }

      return {
        planId: plan.id,
        userId,
        status: autoStatus,
        updatedAt: new Date()
      };
    });

    res.json({
      clubBook,
      plan: plans,
      progress: progressWithStatus
    });
  } catch (error: unknown) {
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

    const clubBook = await findClubActiveBook(clubId);

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
  } catch (error: unknown) {
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

    const updates: Partial<typeof clubReadingPlans.$inferInsert> = {};
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    console.error('[Club Reader] Delete reading plan error:', error);
    res.status(500).json({ message: 'Failed to delete reading plan' });
  }
});

/**
 * PATCH /api/clubs/:clubId/reading-plan/:planId/status
 * Обновление статуса этапа плана для текущего пользователя
 */
router.patch('/:clubId/reading-plan/:planId/status', jwtAuth, async (req, res) => {
  try {
    const { clubId, planId } = req.params;
    const userId = req.user?.id;
    const { status } = req.body;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!['not_started', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const { club, member } = await getClubBookAccessContext(clubId, userId);

    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (!member) {
      return res.status(403).json({ message: 'Not a member of this club' });
    }

    if (!canAccessReaderLedBook(club, member, userId)) {
      return sendReaderLedBookAccessDenied(res);
    }

    // Проверяем что план существует и принадлежит этому клубу
    const [plan] = await db
      .select()
      .from(clubReadingPlans)
      .innerJoin(clubBooks, eq(clubReadingPlans.clubBookId, clubBooks.id))
      .where(and(
        eq(clubReadingPlans.id, planId),
        eq(clubBooks.clubId, clubId)
      ))
      .limit(1);

    if (!plan) {
      return res.status(404).json({ message: 'Reading plan not found' });
    }

    // Upsert статуса
    const [existing] = await db
      .select()
      .from(clubReadingPlanProgress)
      .where(and(
        eq(clubReadingPlanProgress.planId, planId),
        eq(clubReadingPlanProgress.userId, userId)
      ))
      .limit(1);

    if (existing) {
      await db
        .update(clubReadingPlanProgress)
        .set({ status, updatedAt: new Date() })
        .where(eq(clubReadingPlanProgress.id, existing.id));
    } else {
      await db
        .insert(clubReadingPlanProgress)
        .values({
          planId,
          userId,
          status,
          updatedAt: new Date()
        });
    }

    res.json({ success: true, status });
  } catch (error: unknown) {
    console.error('[Club Reader] Update plan status error:', error);
    res.status(500).json({ message: 'Failed to update plan status' });
  }
});

/**
 * DELETE /api/clubs/:clubId/chat/cleanup
 * Ручная очистка удалённых сообщений чата клуба (только владелец или админ)
 */
router.delete('/:clubId/chat/cleanup', jwtAuth, async (req, res) => {
  try {
    const { clubId } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = user.id;
    const isAdmin = user.role === 'admin';

    // Проверяем, что пользователь участник клуба
    const [member] = await db
      .select()
      .from(clubMembers)
      .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
      .limit(1);

    if (!member && !isAdmin) {
      return res.status(403).json({ message: 'Not a member of this club' });
    }

    const isOwner = member?.role === 'owner';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Only club owner or admin can cleanup chat messages' });
    }

    const olderThanDays = Number.parseInt((req.query.olderThanDays as string) || '30', 10);
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const deleted = await db
      .delete(chatMessages)
      .where(
        and(
          eq(chatMessages.clubId, clubId),
          isNotNull(chatMessages.deletedAt),
          lt(chatMessages.deletedAt, cutoffDate),
        ),
      )
      .returning({ id: chatMessages.id });

    res.json({
      success: true,
      deletedCount: deleted.length,
      olderThanDays,
    });
  } catch (error: unknown) {
    console.error('[Club Reader] Cleanup chat error:', error);
    res.status(500).json({ message: 'Failed to cleanup chat messages' });
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

    const { club, member } = await getClubBookAccessContext(clubId, userId);

    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (!member) {
      return res.status(403).json({ message: 'Not a member of this club' });
    }

    if (!canAccessReaderLedBook(club, member, userId)) {
      return sendReaderLedBookAccessDenied(res);
    }

    const clubBook = await findClubActiveBook(clubId);

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

    const userIds = clubMembersList.map((m) => m.userId);
    const usersData = userIds.length === 0
      ? []
      : await db
          .select({
            id: users.id,
            username: users.username,
          })
          .from(users)
          .where(inArray(users.id, userIds));

    const profilesData = userIds.length === 0
      ? []
      : await db
          .select({
            userId: userProfiles.userId,
            displayName: userProfiles.displayName,
          })
          .from(userProfiles)
          .where(inArray(userProfiles.userId, userIds));

    const result = clubMembersList.map((member) => {
      const user = usersData.find((u) => u.id === member.userId);
      const profile = profilesData.find((p) => p.userId === member.userId);
      const progress = progressData.find((p) => p.userId === member.userId);

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
  } catch (error: unknown) {
    console.error('[Club Reader] Get members progress error:', error);
    res.status(500).json({ message: 'Failed to get members progress' });
  }
});

export default router;
