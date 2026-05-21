import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import {
  users,
  userProfiles,
  userFollows,
  bookReadingStatus,
  userReadingGoals,
  profileBookshelf,
  personalBooks,
  clubBooks,
} from '../../shared/schema.js';
import { eq, and, sql, ilike, or, ne, desc, inArray, isNull, gte, lte } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { repositories } from '../repositories/index.js';
import { jwtAuth, optionalJwtAuth } from '../jwt-middleware.js';
import { getRedisClient } from '../lib/redis.js';

const router = Router();

const STATS_CACHE_TTL_SECONDS = 60 * 60;

function isOwnProfileOrAdmin(req: Request, targetUserId: string): boolean {
  const actor = req.user;
  return Boolean(actor && (actor.id === targetUserId || actor.role === 'admin'));
}

async function canViewStats(viewerId: string | null, targetUserId: string): Promise<boolean> {
  if (viewerId === targetUserId) return true;

  const canViewProfile = await repositories.social.canViewProfile(viewerId, targetUserId);
  if (!canViewProfile) return false;

  const privacy = await repositories.social.getPrivacySettings(targetUserId);
  return privacy.readingStatsVisible;
}

async function canViewBookshelf(viewerId: string | null, targetUserId: string): Promise<boolean> {
  if (viewerId === targetUserId) return true;

  const canViewProfile = await repositories.social.canViewProfile(viewerId, targetUserId);
  if (!canViewProfile) return false;

  const privacy = await repositories.social.getPrivacySettings(targetUserId);
  return privacy.readingHistoryVisible;
}

function normalizeRating(rating: unknown): number | null {
  if (rating === null || rating === undefined || rating === '') return null;
  const value = Number(rating);
  if (!Number.isInteger(value) || value < 1 || value > 5) return null;
  return value;
}

function normalizeReviewText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
}

function normalizeDisplayOrder(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1000, Math.floor(parsed)));
}

async function buildGenreDistribution(userId: string): Promise<Array<{ genre: string; count: number }>> {
  const statuses = await db
    .select({ bookId: bookReadingStatus.bookId, bookType: bookReadingStatus.bookType })
    .from(bookReadingStatus)
    .where(eq(bookReadingStatus.userId, userId));

  if (statuses.length === 0) return [];

  const personalIds = Array.from(new Set(statuses.filter((s) => s.bookType === 'personal').map((s) => s.bookId)));
  const clubIds = Array.from(new Set(statuses.filter((s) => s.bookType === 'club').map((s) => s.bookId)));

  const genreCounts = new Map<string, number>();

  if (personalIds.length > 0) {
    const rows = await db
      .select({ genre: personalBooks.genre })
      .from(personalBooks)
      .where(inArray(personalBooks.id, personalIds));

    for (const row of rows) {
      const genre = row.genre?.trim();
      if (!genre) continue;
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }

  if (clubIds.length > 0) {
    const rows = await db
      .select({ genre: clubBooks.genre })
      .from(clubBooks)
      .where(inArray(clubBooks.id, clubIds));

    for (const row of rows) {
      const genre = row.genre?.trim();
      if (!genre) continue;
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }

  return Array.from(genreCounts.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

/**
 * GET /api/users/search?q=&type=all|readers|listeners&limit=20&cursor=
 * Полнотекстовый поиск пользователей.
 * JWT опционален — гости тоже могут искать, но не видят статус подписки.
 */
router.get('/search', optionalJwtAuth, async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const type = (req.query.type as string) || 'all';
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const viewerId = req.user?.id ?? null;

  if (q.length < 2) {
    return res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
  }

  try {
    const conditions = [
      eq(users.status, 'active'),
      or(
        sql`to_tsvector('russian', ${users.username}) @@ plainto_tsquery('russian', ${q})`,
        sql`to_tsvector('russian', COALESCE(${userProfiles.displayName}, '')) @@ plainto_tsquery('russian', ${q})`,
        ilike(users.username, `%${q}%`),
        ilike(userProfiles.displayName, `%${q}%`),
      ),
    ];

    // Фильтр по типу
    if (type === 'readers') {
      conditions.push(eq(userProfiles.isReader, true));
    } else if (type === 'listeners') {
      conditions.push(eq(userProfiles.isReader, false));
    }

    // Исключить себя из результатов
    if (viewerId) {
      conditions.push(ne(users.id, viewerId));
    }

    // Cursor-based пагинация по id
    if (cursor) {
      conditions.push(sql`${users.id} > ${cursor}`);
    }

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: userProfiles.displayName,
        avatar: userProfiles.avatar,
        bio: userProfiles.bio,
        isReader: userProfiles.isReader,
        followersCount: userProfiles.followersCount,
        followingCount: userProfiles.followingCount,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(...conditions))
      .orderBy(
        sql`ts_rank(to_tsvector('russian', ${users.username}), plainto_tsquery('russian', ${q})) DESC`,
        userProfiles.followersCount,
      )
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items.at(-1)?.id ?? null : null;

    // Для авторизованных добавляем isFollowing
    let results: Array<(typeof items)[number] & { isFollowing?: boolean }> = items;

    if (viewerId && items.length > 0) {
      const targetIds = items.map((r) => r.id);
      const arrayLiteral = sql.join(targetIds.map((id) => sql`${id}`), sql`, `);
      const follows = await db
        .select({ followingId: userFollows.followingId })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.followerId, viewerId),
            sql`${userFollows.followingId} = ANY(ARRAY[${arrayLiteral}]::text[])`,
          ),
        );
      const followingSet = new Set(follows.map((f) => f.followingId));
      results = items.map((r) => ({ ...r, isFollowing: followingSet.has(r.id) }));
    }

    res.json({ success: true, users: results, nextCursor, total: items.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[users] search error');
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

/**
 * GET /api/users/:userId/profile
 * Публичный профиль пользователя.
 */
router.get('/:userId/profile', optionalJwtAuth, async (req: Request, res: Response) => {
  const { userId } = req.params;
  const viewerId = req.user?.id ?? null;

  try {
    const canView = await repositories.social.canViewProfile(viewerId, userId);
    if (!canView) {
      return res.status(403).json({ success: false, error: 'Profile is private' });
    }

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: userProfiles.displayName,
        avatar: userProfiles.avatar,
        bio: userProfiles.bio,
        isReader: userProfiles.isReader,
        followersCount: userProfiles.followersCount,
        followingCount: userProfiles.followingCount,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(users.id, userId), eq(users.status, 'active')))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const profile = rows[0];
    let followStatus = { isFollowing: false, isFollower: false };
    if (viewerId && viewerId !== userId) {
      followStatus = await repositories.social.getFollowStatus(viewerId, userId);
    }

    res.json({ success: true, profile: { ...profile, ...followStatus } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[users] profile error');
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

/**
 * GET /api/users/:userId/stats
 * Читательская статистика профиля.
 */
router.get('/:userId/stats', optionalJwtAuth, async (req: Request, res: Response) => {
  const { userId } = req.params;
  const viewerId = req.user?.id ?? null;

  try {
    const canView = await canViewStats(viewerId, userId);
    if (!canView) {
      return res.status(403).json({ success: false, error: 'Reading stats are private' });
    }

    const cacheKey = `users:stats:v1:${userId}`;
    const redis = await getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (error) {
        logger.warn({ error }, '[users] stats cache read failed');
      }
    }

    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    const [profile] = await db
      .select({
        followersCount: userProfiles.followersCount,
        followingCount: userProfiles.followingCount,
        totalReadingSessions: userProfiles.totalReadingSessions,
        totalListeners: userProfiles.totalListeners,
        readerRating: userProfiles.readerRating,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    const statusRows = await db
      .select({ status: bookReadingStatus.status })
      .from(bookReadingStatus)
      .where(eq(bookReadingStatus.userId, userId));

    const statusBreakdown = statusRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});

    const [goal] = await db
      .select({ goalBooks: userReadingGoals.goalBooks })
      .from(userReadingGoals)
      .where(and(eq(userReadingGoals.userId, userId), eq(userReadingGoals.year, currentYear)))
      .limit(1);

    const [completedThisYear] = await db
      .select({ count: sql<string>`count(*)::text` })
      .from(bookReadingStatus)
      .where(
        and(
          eq(bookReadingStatus.userId, userId),
          eq(bookReadingStatus.status, 'completed'),
          or(
            isNull(bookReadingStatus.completedAt),
            and(gte(bookReadingStatus.completedAt, yearStart), lte(bookReadingStatus.completedAt, yearEnd)),
          ),
        ),
      );

    const yearlyProgress = Number.parseInt(completedThisYear?.count ?? '0', 10);
    const goalBooks = goal?.goalBooks ?? 12;
    const genreDistribution = await buildGenreDistribution(userId);

    const payload = {
      success: true,
      stats: {
        totalBooks: statusRows.length,
        completedBooks: statusBreakdown.completed ?? 0,
        currentlyReading: statusBreakdown.reading ?? 0,
        plannedBooks: statusBreakdown.planned ?? 0,
        abandonedBooks: statusBreakdown.abandoned ?? 0,
        readingSessions: profile?.totalReadingSessions ?? 0,
        totalListeners: profile?.totalListeners ?? 0,
        readerRating: Number(((profile?.readerRating ?? 0) / 100).toFixed(1)),
        followersCount: profile?.followersCount ?? 0,
        followingCount: profile?.followingCount ?? 0,
        yearlyGoal: {
          year: currentYear,
          goalBooks,
          progress: yearlyProgress,
          percentComplete: goalBooks > 0 ? Math.round((yearlyProgress / goalBooks) * 100) : 0,
        },
        genreDistribution,
      },
    };

    if (redis) {
      try {
        await redis.setEx(cacheKey, STATS_CACHE_TTL_SECONDS, JSON.stringify(payload));
      } catch (error) {
        logger.warn({ error }, '[users] stats cache write failed');
      }
    }

    res.json(payload);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[users] stats error');
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

/**
 * GET /api/users/:userId/bookshelf
 * Публичная полка профиля.
 */
router.get('/:userId/bookshelf', optionalJwtAuth, async (req: Request, res: Response) => {
  const { userId } = req.params;
  const viewerId = req.user?.id ?? null;

  try {
    const canView = await canViewBookshelf(viewerId, userId);
    if (!canView) {
      return res.status(403).json({ success: false, error: 'Bookshelf is private' });
    }

    const rows = await db
      .select()
      .from(profileBookshelf)
      .where(eq(profileBookshelf.userId, userId))
      .orderBy(profileBookshelf.displayOrder, desc(profileBookshelf.createdAt))
      .limit(100);

    const personalIds = rows.filter((row) => row.bookType === 'personal').map((row) => row.bookId);
    const clubIds = rows.filter((row) => row.bookType === 'club').map((row) => row.bookId);

    const personalMap = new Map<string, { id: string; title: string; author: string; coverUrl: string | null }>();
    const clubMap = new Map<string, { id: string; title: string; author: string; coverUrl: string | null }>();

    if (personalIds.length > 0) {
      const books = await db
        .select({ id: personalBooks.id, title: personalBooks.title, author: personalBooks.author, coverUrl: personalBooks.coverUrl })
        .from(personalBooks)
        .where(inArray(personalBooks.id, personalIds));
      for (const book of books) {
        personalMap.set(book.id, book);
      }
    }

    if (clubIds.length > 0) {
      const books = await db
        .select({ id: clubBooks.id, title: clubBooks.title, author: clubBooks.author, coverUrl: clubBooks.coverUrl })
        .from(clubBooks)
        .where(and(inArray(clubBooks.id, clubIds), eq(clubBooks.isDeleted, false)));
      for (const book of books) {
        clubMap.set(book.id, book);
      }
    }

    const items = rows.map((row) => ({
      ...row,
      book: row.bookType === 'personal' ? (personalMap.get(row.bookId) ?? null) : (clubMap.get(row.bookId) ?? null),
    }));

    res.json({ success: true, items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[users] bookshelf get error');
    res.status(500).json({ success: false, error: 'Failed to get bookshelf' });
  }
});

/**
 * POST /api/users/:userId/bookshelf
 * Добавить/обновить запись в полке профиля.
 */
router.post('/:userId/bookshelf', jwtAuth, async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!isOwnProfileOrAdmin(req, userId)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const { bookId, bookType } = req.body as { bookId?: string; bookType?: 'personal' | 'club' };
  const reviewText = normalizeReviewText(req.body?.reviewText);
  const rating = normalizeRating(req.body?.rating);
  const displayOrder = normalizeDisplayOrder(req.body?.displayOrder);

  if (!bookId || (bookType !== 'personal' && bookType !== 'club')) {
    return res.status(400).json({ success: false, error: 'bookId and valid bookType are required' });
  }

  if (req.body?.rating !== undefined && rating === null) {
    return res.status(400).json({ success: false, error: 'rating must be integer 1..5' });
  }

  try {
    const [item] = await db
      .insert(profileBookshelf)
      .values({
        userId,
        bookId,
        bookType,
        reviewText,
        rating,
        displayOrder,
      })
      .onConflictDoUpdate({
        target: [profileBookshelf.userId, profileBookshelf.bookId, profileBookshelf.bookType],
        set: {
          reviewText,
          rating,
          displayOrder,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.json({ success: true, item });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[users] bookshelf upsert error');
    res.status(500).json({ success: false, error: 'Failed to save bookshelf item' });
  }
});

/**
 * PUT /api/users/:userId/bookshelf/:itemId
 * Обновить запись на полке профиля.
 */
router.put('/:userId/bookshelf/:itemId', jwtAuth, async (req: Request, res: Response) => {
  const { userId, itemId } = req.params;
  if (!isOwnProfileOrAdmin(req, userId)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const reviewText = normalizeReviewText(req.body?.reviewText);
  const rating = normalizeRating(req.body?.rating);
  const displayOrder = normalizeDisplayOrder(req.body?.displayOrder);

  if (req.body?.rating !== undefined && rating === null) {
    return res.status(400).json({ success: false, error: 'rating must be integer 1..5' });
  }

  try {
    const updatePayload: { reviewText?: string | null; rating?: number | null; displayOrder?: number; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if ('reviewText' in req.body) updatePayload.reviewText = reviewText;
    if ('rating' in req.body) updatePayload.rating = rating;
    if ('displayOrder' in req.body) updatePayload.displayOrder = displayOrder;

    const [item] = await db
      .update(profileBookshelf)
      .set(updatePayload)
      .where(and(eq(profileBookshelf.id, itemId), eq(profileBookshelf.userId, userId)))
      .returning();

    if (!item) {
      return res.status(404).json({ success: false, error: 'Bookshelf item not found' });
    }

    res.json({ success: true, item });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[users] bookshelf update error');
    res.status(500).json({ success: false, error: 'Failed to update bookshelf item' });
  }
});

/**
 * DELETE /api/users/:userId/bookshelf/:itemId
 * Удалить запись с полки профиля.
 */
router.delete('/:userId/bookshelf/:itemId', jwtAuth, async (req: Request, res: Response) => {
  const { userId, itemId } = req.params;
  if (!isOwnProfileOrAdmin(req, userId)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  try {
    const deleted = await db
      .delete(profileBookshelf)
      .where(and(eq(profileBookshelf.id, itemId), eq(profileBookshelf.userId, userId)))
      .returning({ id: profileBookshelf.id });

    if (deleted.length === 0) {
      return res.status(404).json({ success: false, error: 'Bookshelf item not found' });
    }

    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[users] bookshelf delete error');
    res.status(500).json({ success: false, error: 'Failed to delete bookshelf item' });
  }
});

export default router;
