import express from 'express';
import { jwtAuth } from './jwt-middleware.js';
import { db } from './db.js';
import { bookReadingStatus, userReadingGoals, personalBooks, clubBooks } from '../shared/schema.js';
import { eq, and, or, sql, isNull, gte, lte } from 'drizzle-orm';
import { logger } from './lib/logger.js';

const router = express.Router();

// Helper functions для уменьшения когнитивной сложности
function prepareUpdateData(status: string, existingStatus: any, progress: number, notes?: string, rating?: number) {
  const updateData: any = {
    status,
    progress,
    updatedAt: new Date(),
  };

  if (notes !== undefined) updateData.notes = notes;
  if (rating !== undefined) updateData.rating = rating;

  // Автоматически проставляем даты
  if (status === 'reading' && !existingStatus.startedAt) {
    updateData.startedAt = new Date();
  }
  if (status === 'completed' && !existingStatus.completedAt) {
    updateData.completedAt = new Date();
    updateData.progress = 100;
  }

  return updateData;
}

function prepareInsertData(userId: string, bookId: string, bookType: string, status: string, progress: number, notes?: string, rating?: number) {
  const insertData: any = {
    userId,
    bookId,
    bookType,
    status,
    progress,
    notes,
    rating,
  };

  if (status === 'reading') {
    insertData.startedAt = new Date();
  }
  if (status === 'completed') {
    insertData.completedAt = new Date();
    insertData.progress = 100;
  }

  return insertData;
}

// ===== СТАТУСЫ КНИГ =====

/**
 * GET /api/reading-status
 * Получить статусы книг текущего пользователя
 */
router.get('/', jwtAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { status, bookType } = req.query;

    logger.info(`[ReadingStatus Debug] User ${userId} requesting books with status=${JSON.stringify(status)}, bookType=${JSON.stringify(bookType)}`);

    let conditions = [eq(bookReadingStatus.userId, userId)];

    // Фильтр по статусу
    if (status && typeof status === 'string') {
      conditions.push(eq(bookReadingStatus.status, status as any));
    }

    // Фильтр по типу книги
    if (bookType && typeof bookType === 'string') {
      conditions.push(eq(bookReadingStatus.bookType, bookType as any));
    }

    const statuses = await db
      .select()
      .from(bookReadingStatus)
      .where(and(...conditions));

    logger.info(`[ReadingStatus Debug] Found ${statuses.length} records`);

    // Обогащаем данными книг
    const enrichedStatuses = await Promise.all(
      statuses.map(async (status) => {
        let bookInfo = null;

        if (status.bookType === 'personal') {
          const [book] = await db
            .select()
            .from(personalBooks)
            .where(eq(personalBooks.id, status.bookId))
            .limit(1);
          bookInfo = book;
        } else if (status.bookType === 'club') {
          const [book] = await db
            .select()
            .from(clubBooks)
            .where(eq(clubBooks.id, status.bookId))
            .limit(1);
          bookInfo = book;
        }

        return {
          ...status,
          book: bookInfo,
        };
      })
    );

    logger.info(`[ReadingStatus Debug] Returning ${enrichedStatuses.length} enriched records`);

    res.json(enrichedStatuses);
  } catch (error) {
    logger.error({ error }, 'Error fetching reading statuses');
    res.status(500).json({ message: 'Failed to fetch reading statuses' });
  }
});

// ===== СТАТИСТИКА (ДОЛЖНА БЫТЬ ПЕРЕД /:bookId) =====

/**
 * GET /api/reading-status/stats/year/:year
 * Получить статистику чтения за год
 */
router.get('/stats/year/:year', jwtAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const year = Number.parseInt(req.params.year);
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

    logger.info(`[Stats Debug] User ${userId} requesting stats for year ${year}`);

    // Количество прочитанных книг за год (с учетом NULL completedAt)
    const [completedCount] = await db
      .select({ count: sql<string>`count(*)::text` })
      .from(bookReadingStatus)
      .where(
        and(
          eq(bookReadingStatus.userId, userId),
          eq(bookReadingStatus.status, 'completed'),
          or(
            isNull(bookReadingStatus.completedAt),
            and(
              gte(bookReadingStatus.completedAt, startOfYear),
              lte(bookReadingStatus.completedAt, endOfYear)
            )
          )
        )
      );

    logger.info(`[Stats Debug] Completed count raw: ${JSON.stringify(completedCount)}`);

    // Статистика по статусам (всего по каждому статусу)
    const statusStats = await db
      .select({
        status: bookReadingStatus.status,
        count: sql<string>`count(*)::text`,
      })
      .from(bookReadingStatus)
      .where(eq(bookReadingStatus.userId, userId))
      .groupBy(bookReadingStatus.status);

    logger.info(`[Stats Debug] Status breakdown raw: ${JSON.stringify(statusStats)}`);

    const result = {
      year,
      completedBooks: Number.parseInt(completedCount?.count || '0'),
      statusBreakdown: statusStats.reduce((acc: any, stat) => {
        acc[stat.status] = Number.parseInt(stat.count);
        return acc;
      }, {}),
    };

    logger.info(`[Stats Debug] Final result: ${JSON.stringify(result)}`);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error fetching reading stats');
    res.status(500).json({ message: 'Failed to fetch reading stats' });
  }
});

// ===== ЦЕЛИ ЧТЕНИЯ (ДОЛЖНА БЫТЬ ПЕРЕД /:bookId) =====

/**
 * GET /api/reading-status/goal/:year
 * Получить цель чтения на год
 */
router.get('/goal/:year', jwtAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const year = Number.parseInt(req.params.year);

    logger.info(`[Goal Debug] User ${userId} requesting goal for year ${year}`);

    const [goal] = await db
      .select()
      .from(userReadingGoals)
      .where(
        and(
          eq(userReadingGoals.userId, userId),
          eq(userReadingGoals.year, year)
        )
      )
      .limit(1);

    logger.info(`[Goal Debug] Goal from DB: ${JSON.stringify(goal)}`);

    if (!goal) {
      logger.info(`[Goal Debug] No goal found, returning default`);
      return res.json({ year, goalBooks: 12, progress: 0 });
    }

    // Подсчитываем прогресс
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

    const [completedCount] = await db
      .select({ count: sql<string>`count(*)::text` })
      .from(bookReadingStatus)
      .where(
        and(
          eq(bookReadingStatus.userId, userId),
          eq(bookReadingStatus.status, 'completed'),
          or(
            isNull(bookReadingStatus.completedAt),
            and(
              gte(bookReadingStatus.completedAt, startOfYear),
              lte(bookReadingStatus.completedAt, endOfYear)
            )
          )
        )
      );

    logger.info(`[Goal Debug] Completed count raw: ${JSON.stringify(completedCount)}`);

    const progress = Number.parseInt(completedCount?.count || '0');

    const result = {
      ...goal,
      progress,
      percentComplete: Math.round((progress / goal.goalBooks) * 100),
    };

    logger.info(`[Goal Debug] Final result: ${JSON.stringify(result)}`);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error fetching reading goal');
    res.status(500).json({ message: 'Failed to fetch reading goal' });
  }
});

/**
 * PUT /api/reading-status/goal/:year
 * Установить цель чтения на год
 */
router.put('/goal/:year', jwtAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const year = Number.parseInt(req.params.year);
    const { goalBooks } = req.body;

    if (!goalBooks || goalBooks < 1) {
      return res.status(400).json({ message: 'goalBooks must be at least 1' });
    }

    // Проверяем существующую цель
    const [existingGoal] = await db
      .select()
      .from(userReadingGoals)
      .where(
        and(
          eq(userReadingGoals.userId, userId),
          eq(userReadingGoals.year, year)
        )
      )
      .limit(1);

    let result;

    if (existingGoal) {
      [result] = await db
        .update(userReadingGoals)
        .set({ goalBooks, updatedAt: new Date() })
        .where(eq(userReadingGoals.id, existingGoal.id))
        .returning();
    } else {
      [result] = await db
        .insert(userReadingGoals)
        .values({ userId, year, goalBooks })
        .returning();
    }

    logger.info(`Reading goal ${existingGoal ? 'updated' : 'created'} for user ${userId}, year ${year}: ${goalBooks} books`);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error setting reading goal');
    res.status(500).json({ message: 'Failed to set reading goal' });
  }
});

// ===== ОПЕРАЦИИ С КОНКРЕТНОЙ КНИГОЙ (ПОСЛЕ /stats И /goal) =====

/**
 * GET /api/reading-status/:bookId
 * Получить статус конкретной книги
 */
router.get('/:bookId', jwtAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { bookId } = req.params;
    const { bookType = 'personal' } = req.query;

    const [status] = await db
      .select()
      .from(bookReadingStatus)
      .where(
        and(
          eq(bookReadingStatus.userId, userId),
          eq(bookReadingStatus.bookId, bookId),
          eq(bookReadingStatus.bookType, bookType as any)
        )
      )
      .limit(1);

    if (!status) {
      return res.status(404).json({ message: 'Status not found' });
    }

    res.json(status);
  } catch (error) {
    logger.error({ error }, 'Error fetching reading status');
    res.status(500).json({ message: 'Failed to fetch reading status' });
  }
});

/**
 * POST /api/reading-status
 * Создать или обновить статус книги
 */
router.post('/', jwtAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const {
      bookId,
      bookType = 'personal',
      status,
      progress = 0,
      notes,
      rating,
    } = req.body;

    if (!bookId || !status) {
      return res.status(400).json({ message: 'bookId and status are required' });
    }

    // Проверяем существующий статус
    const [existingStatus] = await db
      .select()
      .from(bookReadingStatus)
      .where(
        and(
          eq(bookReadingStatus.userId, userId),
          eq(bookReadingStatus.bookId, bookId),
          eq(bookReadingStatus.bookType, bookType)
        )
      )
      .limit(1);

    let result;

    if (existingStatus) {
      // Обновляем существующий
      const updateData = prepareUpdateData(status, existingStatus, progress, notes, rating);

      [result] = await db
        .update(bookReadingStatus)
        .set(updateData)
        .where(eq(bookReadingStatus.id, existingStatus.id))
        .returning();
    } else {
      // Создаем новый
      const insertData = prepareInsertData(userId, bookId, bookType, status, progress, notes, rating);

      [result] = await db
        .insert(bookReadingStatus)
        .values(insertData)
        .returning();
    }

    logger.info(`Reading status ${existingStatus ? 'updated' : 'created'} for user ${userId}, book ${bookId}`);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error creating/updating reading status');
    res.status(500).json({ message: 'Failed to save reading status' });
  }
});

/**
 * DELETE /api/reading-status/:bookId
 * Удалить статус книги
 */
router.delete('/:bookId', jwtAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { bookId } = req.params;
    const { bookType = 'personal' } = req.query;

    await db
      .delete(bookReadingStatus)
      .where(
        and(
          eq(bookReadingStatus.userId, userId),
          eq(bookReadingStatus.bookId, bookId),
          eq(bookReadingStatus.bookType, bookType as any)
        )
      );

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error deleting reading status');
    res.status(500).json({ message: 'Failed to delete reading status' });
  }
});

export default router;
