import { Router, Request, Response } from 'express';
import { db } from './db.js';
import {
  analyticsEvents,
  books,
  users,
  personalBooks,
  clubBooks,
  clubs,
  clubMembers,
  type InsertAnalyticsEvent,
} from '../shared/schema.js';
import { jwtAuth, requireAdmin } from './jwt-middleware.js';
import { eq, sql, and, gte, desc, count, inArray } from 'drizzle-orm';
import { kpiCalculator } from './analytics/kpi-calculator.js';
import { logger } from './lib/logger.js';

const router = Router();
const CLUB_ANALYTICS_EVENT_TYPES = ['club_join', 'club_leave', 'reading_session'] as const;

function detectDeviceType(userAgent: string): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  const ua = userAgent.toLowerCase();
  if (
    /tablet|ipad|playbook|silk|kindle|nexus 7|nexus 10|sm-t|tab/i.test(ua) ||
    (/android/i.test(ua) && !/mobile/i.test(ua))
  ) {
    return 'tablet';
  }
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) {
    return 'mobile';
  }
  if (/windows|macintosh|linux|x11|cros/i.test(ua)) {
    return 'desktop';
  }
  return 'unknown';
}

function detectBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/firefox\/|fxios/i.test(ua)) return 'Firefox';
  if (/chrome\/|crios/i.test(ua) && !/edg\//i.test(ua) && !/opr\//i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua) && !/chrome\/|crios|edg\//i.test(ua)) return 'Safari';
  if (/msie|trident/i.test(ua)) return 'Internet Explorer';
  return 'Other';
}

function detectOs(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/windows nt/i.test(ua)) return 'Windows';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/mac os x|macintosh/i.test(ua)) return 'macOS';
  if (/cros/i.test(ua)) return 'Chrome OS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Other';
}

/**
 * POST /api/v1/analytics/event
 * Сохранение события аналитики
 */
router.post('/event', jwtAuth, async (req: Request, res: Response) => {
  try {
    const { eventType, bookId, clubId, chapterNumber, duration, progress, metadata } = req.body;

    if (!eventType) {
      return res.status(400).json({ error: 'eventType is required' });
    }

    const userId = req.user?.id;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const eventData: InsertAnalyticsEvent = {
      eventType,
      userId,
      bookId: bookId || null,
      clubId: clubId || null,
      chapterNumber: chapterNumber || null,
      duration: duration || null,
      progress: progress || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      ipAddress,
      userAgent,
    };

    const [newEvent] = await db.insert(analyticsEvents).values(eventData).returning();

    res.status(201).json({ 
      message: 'Event recorded',
      eventId: newEvent.id 
    });
  } catch (error) {
    console.error('[Analytics] Error recording event:', error);
    res.status(500).json({ error: 'Failed to record event' });
  }
});

/**
 * POST /api/v1/analytics/events/batch
 * Сохранение нескольких событий одновременно (для оптимизации)
 */
router.post('/events/batch', jwtAuth, async (req: Request, res: Response) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array is required' });
    }

    const userId = req.user?.id;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const eventsData = events.map(event => ({
      eventType: event.eventType,
      userId,
      bookId: event.bookId || null,
      clubId: event.clubId || null,
      chapterNumber: event.chapterNumber || null,
      duration: event.duration || null,
      progress: event.progress || null,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      ipAddress,
      userAgent,
    }));

    await db.insert(analyticsEvents).values(eventsData);

    res.status(201).json({ 
      message: `${events.length} events recorded` 
    });
  } catch (error) {
    console.error('[Analytics] Error recording batch events:', error);
    res.status(500).json({ error: 'Failed to record batch events' });
  }
});

/**
 * GET /api/v1/analytics/stats
 * Получение общей статистики для админ-панели (только для админов)
 */
router.get('/stats', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '7d' } = req.query; // 7d, 30d, 90d, all
    
    // Вычисляем дату начала периода
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === 'all') {
      startDate = new Date('2020-01-01');
    }

    // Общее количество событий
    const [totalEventsResult] = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, startDate));

    // Количество событий по типам
    const eventsByType = await db
      .select({
        eventType: analyticsEvents.eventType,
        count: count(),
      })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, startDate))
      .groupBy(analyticsEvents.eventType);

    // Топ-10 самых читаемых книг (ищем в personal_books и club_books)
    const topBooksRaw = await db
      .select({
        bookId: analyticsEvents.bookId,
        title: sql<string>`COALESCE(${personalBooks.title}, ${clubBooks.title}, 'Неизвестная книга')`,
        author: sql<string>`COALESCE(${personalBooks.author}, ${clubBooks.author})`,
        events: count(),
      })
      .from(analyticsEvents)
      .leftJoin(personalBooks, eq(analyticsEvents.bookId, personalBooks.id))
      .leftJoin(clubBooks, eq(analyticsEvents.bookId, clubBooks.id))
      .where(
        and(
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, ['book_open', 'reading_session', 'chapter_complete'])
        )
      )
      .groupBy(analyticsEvents.bookId, personalBooks.title, personalBooks.author, clubBooks.title, clubBooks.author)
      .orderBy(desc(count()))
      .limit(10);

    // Обрабатываем результат
    const topBooks = topBooksRaw.map(book => ({
      bookId: book.bookId,
      title: book.title || `Книга ${book.bookId?.slice(0, 8)}...`,
      author: book.author || undefined, // Убираем "Неизвестный автор"
      events: Number(book.events),
    }));

    // Топ-10 самых активных пользователей
    const topUsers = await db
      .select({
        userId: analyticsEvents.userId,
        username: users.username,
        events: count(),
      })
      .from(analyticsEvents)
      .leftJoin(users, eq(analyticsEvents.userId, users.id))
      .where(gte(analyticsEvents.createdAt, startDate))
      .groupBy(analyticsEvents.userId, users.username)
      .orderBy(desc(count()))
      .limit(10);

    // События по клубам (вступления/выходы/сессии чтения)
    const clubEventsRaw = await db
      .select({
        clubId: analyticsEvents.clubId,
        clubTitle: clubs.title,
        totalEvents: count(),
        joinEvents: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'club_join')::int`,
        leaveEvents: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'club_leave')::int`,
        totalSessions: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'reading_session')::int`,
        lastActivityAt: sql<Date | null>`MAX(${analyticsEvents.createdAt})`,
      })
      .from(analyticsEvents)
      .leftJoin(clubs, eq(analyticsEvents.clubId, clubs.id))
      .where(
        and(
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, CLUB_ANALYTICS_EVENT_TYPES),
          sql`${analyticsEvents.clubId} IS NOT NULL`
        )
      )
      .groupBy(analyticsEvents.clubId, clubs.title)
      .orderBy(desc(count()));

    const activeMembersRaw = await db
      .select({
        clubId: clubMembers.clubId,
        activeMembers: count(),
      })
      .from(clubMembers)
      .where(eq(clubMembers.isActive, true))
      .groupBy(clubMembers.clubId);

    const activeMembersMap = new Map(
      activeMembersRaw.map((item) => [item.clubId, Number(item.activeMembers) || 0])
    );

    const clubStats = clubEventsRaw
      .filter((item) => Boolean(item.clubId))
      .map((item) => {
        const clubId = item.clubId as string;
        return {
          clubId,
          clubTitle: item.clubTitle || `Клуб ${clubId.slice(0, 8)}...`,
          totalEvents: Number(item.totalEvents) || 0,
          joinEvents: Number(item.joinEvents) || 0,
          leaveEvents: Number(item.leaveEvents) || 0,
          totalSessions: Number(item.totalSessions) || 0,
          activeMembers: activeMembersMap.get(clubId) || 0,
          lastActivityAt: item.lastActivityAt ? new Date(item.lastActivityAt).toISOString() : null,
        };
      });

    // Среднее время чтения (из reading_session событий)
    const [avgReadingTimeResult] = await db
      .select({
        avgDuration: sql<number>`AVG(${analyticsEvents.duration})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, startDate),
          eq(analyticsEvents.eventType, 'reading_session')
        )
      );

    // Динамика событий по дням (последние 30 дней)
    const eventsTrend = await db
      .select({
        date: sql<string>`DATE(${analyticsEvents.createdAt})`,
        count: count(),
      })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`)
      .orderBy(sql`DATE(${analyticsEvents.createdAt})`);

    // Воронка конверсии чтения (уникальные пары читатель+книга в периоде)
    // Цепочка: book_open → reading_session → chapter_complete → book_complete
    const funnelCountsRaw = await db.execute(
      sql<{
        opens: number;
        sessions: number;
        chapters: number;
        completes: number;
      }>`
        WITH pair_events AS (
          SELECT
            ${analyticsEvents.userId} AS user_id,
            ${analyticsEvents.bookId} AS book_id,
            BOOL_OR(${analyticsEvents.eventType} = 'book_open') AS has_open,
            BOOL_OR(${analyticsEvents.eventType} = 'reading_session') AS has_session,
            BOOL_OR(${analyticsEvents.eventType} = 'chapter_complete') AS has_chapter,
            BOOL_OR(${analyticsEvents.eventType} = 'book_complete') AS has_complete
          FROM ${analyticsEvents}
          WHERE
            ${analyticsEvents.createdAt} >= ${startDate.toISOString()}
            AND ${analyticsEvents.userId} IS NOT NULL
            AND ${analyticsEvents.bookId} IS NOT NULL
          GROUP BY ${analyticsEvents.userId}, ${analyticsEvents.bookId}
        )
        SELECT
          COUNT(*) FILTER (WHERE has_open)::int AS opens,
          COUNT(*) FILTER (WHERE has_open AND has_session)::int AS sessions,
          COUNT(*) FILTER (WHERE has_open AND has_session AND has_chapter)::int AS chapters,
          COUNT(*) FILTER (WHERE has_open AND has_session AND has_chapter AND has_complete)::int AS completes
        FROM pair_events
      `
    );

    const funnelCounts = funnelCountsRaw[0] ?? { opens: 0, sessions: 0, chapters: 0, completes: 0 };
    const funnelStages = [
      { stage: 'book_open', count: Number(funnelCounts.opens) || 0 },
      { stage: 'reading_session', count: Number(funnelCounts.sessions) || 0 },
      { stage: 'chapter_complete', count: Number(funnelCounts.chapters) || 0 },
      { stage: 'book_complete', count: Number(funnelCounts.completes) || 0 },
    ];
    const funnel = funnelStages.map((item, idx) => {
      const prev = idx === 0 ? item.count : funnelStages[idx - 1]?.count || 0;
      let percentage: number;
      if (idx === 0) {
        percentage = 100;
      } else if (prev > 0) {
        percentage = Math.round((item.count / prev) * 100);
      } else {
        percentage = 0;
      }
      return { ...item, percentage };
    });

    const topUsersFiltered = topUsers.filter((user) => Boolean(user.userId));

    res.json({
      period,
      totalEvents: totalEventsResult.count,
      eventsByType,
      topBooks: topBooks.filter((book) => Boolean(book.bookId)), // Убираем записи без bookId
      topUsers: topUsersFiltered, // Убираем записи без пользователей
      clubStats,
      avgReadingTime: Math.round(avgReadingTimeResult.avgDuration || 0),
      eventsTrend,
      funnel,
    });
  } catch (error) {
    console.error('[Analytics] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch analytics stats' });
  }
});

/**
 * GET /api/v1/analytics/heatmap
 * Получение тепловой карты активности по дням недели и часам (для админов)
 */
router.get('/heatmap', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '7d' } = req.query; // 7d, 30d, 90d, all

    // Вычисляем дату начала периода
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === 'all') {
      startDate = new Date('2020-01-01');
    }

    const heatmapRaw = await db
      .select({
        day: sql<number>`EXTRACT(DOW FROM ${analyticsEvents.createdAt})::int`,
        hour: sql<number>`EXTRACT(HOUR FROM ${analyticsEvents.createdAt})::int`,
        count: count(),
      })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, startDate))
      .groupBy(
        sql`EXTRACT(DOW FROM ${analyticsEvents.createdAt})`,
        sql`EXTRACT(HOUR FROM ${analyticsEvents.createdAt})`
      )
      .orderBy(
        sql`EXTRACT(DOW FROM ${analyticsEvents.createdAt})`,
        sql`EXTRACT(HOUR FROM ${analyticsEvents.createdAt})`
      );

    const heatmap = heatmapRaw.map((item) => ({
      day: Number(item.day),
      hour: Number(item.hour),
      count: Number(item.count) || 0,
    }));

    res.json({
      period,
      heatmap,
    });
  } catch (error) {
    console.error('[Analytics] Error fetching heatmap:', error);
    res.status(500).json({ error: 'Failed to fetch analytics heatmap' });
  }
});

/**
 * GET /api/v1/analytics/heatmap/details
 * Детализация событий для конкретной ячейки heatmap (день недели + час)
 */
router.get('/heatmap/details', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '7d', day, hour } = req.query;

    const dayNum = Number(day);
    const hourNum = Number(hour);

    if (!Number.isInteger(dayNum) || dayNum < 0 || dayNum > 6) {
      return res.status(400).json({ error: 'Invalid day. Expected integer 0..6' });
    }

    if (!Number.isInteger(hourNum) || hourNum < 0 || hourNum > 23) {
      return res.status(400).json({ error: 'Invalid hour. Expected integer 0..23' });
    }

    // Вычисляем дату начала периода
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === 'all') {
      startDate = new Date('2020-01-01');
    }

    const whereClause = and(
      gte(analyticsEvents.createdAt, startDate),
      sql`EXTRACT(DOW FROM ${analyticsEvents.createdAt})::int = ${dayNum}`,
      sql`EXTRACT(HOUR FROM ${analyticsEvents.createdAt})::int = ${hourNum}`
    );

    const [totalEventsResult] = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(whereClause);

    const eventsByTypeRaw = await db
      .select({
        eventType: analyticsEvents.eventType,
        count: count(),
      })
      .from(analyticsEvents)
      .where(whereClause)
      .groupBy(analyticsEvents.eventType)
      .orderBy(desc(count()));

    const totalEvents = Number(totalEventsResult?.count) || 0;
    const eventsByType = eventsByTypeRaw.map((item) => {
      const itemCount = Number(item.count) || 0;
      return {
        eventType: item.eventType,
        count: itemCount,
        percentage: totalEvents > 0 ? Math.round((itemCount / totalEvents) * 100) : 0,
      };
    });

    const recentEvents = await db
      .select({
        id: analyticsEvents.id,
        eventType: analyticsEvents.eventType,
        createdAt: analyticsEvents.createdAt,
        userId: analyticsEvents.userId,
        username: users.username,
        bookId: analyticsEvents.bookId,
        bookTitle: sql<string | null>`COALESCE(${personalBooks.title}, ${clubBooks.title}, ${books.title})`,
        chapterNumber: analyticsEvents.chapterNumber,
        duration: analyticsEvents.duration,
        progress: analyticsEvents.progress,
      })
      .from(analyticsEvents)
      .leftJoin(users, eq(analyticsEvents.userId, users.id))
      .leftJoin(books, eq(analyticsEvents.bookId, books.id))
      .leftJoin(personalBooks, eq(analyticsEvents.bookId, personalBooks.id))
      .leftJoin(clubBooks, eq(analyticsEvents.bookId, clubBooks.id))
      .where(whereClause)
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(50);

    res.json({
      period,
      day: dayNum,
      hour: hourNum,
      totalEvents,
      eventsByType,
      recentEvents,
    });
  } catch (error) {
    console.error('[Analytics] Error fetching heatmap cell details:', error);
    res.status(500).json({ error: 'Failed to fetch heatmap cell details' });
  }
});

/**
 * GET /api/v1/analytics/devices
 * Статистика по устройствам, браузерам и ОС (для админов)
 */
router.get('/devices', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '30d' } = req.query; // 7d, 30d, 90d, all

    // Вычисляем дату начала периода
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === 'all') {
      startDate = new Date('2020-01-01');
    }

    const uaRows = await db
      .select({
        userAgent: analyticsEvents.userAgent,
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, startDate),
          sql`${analyticsEvents.userAgent} IS NOT NULL`
        )
      );

    const deviceType = {
      desktop: 0,
      mobile: 0,
      tablet: 0,
      unknown: 0,
    };

    const browserMap = new Map<string, number>();
    const osMap = new Map<string, number>();

    for (const row of uaRows) {
      const ua = row.userAgent?.trim();
      if (!ua) continue;

      const type = detectDeviceType(ua);
      deviceType[type] += 1;

      const browser = detectBrowser(ua);
      browserMap.set(browser, (browserMap.get(browser) || 0) + 1);

      const os = detectOs(ua);
      osMap.set(os, (osMap.get(os) || 0) + 1);
    }

    const browsers = Array.from(browserMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const os = Array.from(osMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      period,
      totalUserAgentEvents: uaRows.length,
      deviceType,
      browsers,
      os,
    });
  } catch (error) {
    console.error('[Analytics] Error fetching device stats:', error);
    res.status(500).json({ error: 'Failed to fetch analytics devices stats' });
  }
});

/**
 * GET /api/v1/analytics/user-journey
 * Базовые метрики User Journey: время до первого чтения
 */
router.get('/user-journey', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '30d' } = req.query; // 7d, 30d, 90d, all

    // Вычисляем дату начала периода (по дате регистрации пользователя)
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === 'all') {
      startDate = new Date('2020-01-01');
    }

    const summaryRaw = await db.execute(
      sql<{
        users_with_first_read: number;
        users_without_read: number;
        avg_days_to_first_read: number | null;
      }>`
        WITH user_first_read AS (
          SELECT
            u.id AS user_id,
            u.created_at AS registered_at,
            MIN(ae.created_at) FILTER (
              WHERE ae.event_type IN ('book_open', 'reading_session')
            ) AS first_read_at
          FROM users u
          LEFT JOIN analytics_events ae
            ON ae.user_id = u.id
          WHERE u.created_at >= ${startDate.toISOString()}
          GROUP BY u.id, u.created_at
        )
        SELECT
          COUNT(*) FILTER (WHERE first_read_at IS NOT NULL)::int AS users_with_first_read,
          COUNT(*) FILTER (WHERE first_read_at IS NULL)::int AS users_without_read,
          AVG(
            EXTRACT(EPOCH FROM (first_read_at - registered_at)) / 86400.0
          ) FILTER (WHERE first_read_at IS NOT NULL) AS avg_days_to_first_read
        FROM user_first_read
      `
    );

    const distributionRaw = await db.execute(
      sql<{
        days_range: string;
        count: number;
        sort_order: number;
      }>`
        WITH user_first_read AS (
          SELECT
            u.id AS user_id,
            u.created_at AS registered_at,
            MIN(ae.created_at) FILTER (
              WHERE ae.event_type IN ('book_open', 'reading_session')
            ) AS first_read_at
          FROM users u
          LEFT JOIN analytics_events ae
            ON ae.user_id = u.id
          WHERE u.created_at >= ${startDate.toISOString()}
          GROUP BY u.id, u.created_at
        ),
        first_read_days AS (
          SELECT
            GREATEST(
              EXTRACT(EPOCH FROM (first_read_at - registered_at)) / 86400.0,
              0
            ) AS days_to_first_read
          FROM user_first_read
          WHERE first_read_at IS NOT NULL
        )
        SELECT
          CASE
            WHEN days_to_first_read < 1 THEN '0-1'
            WHEN days_to_first_read < 3 THEN '1-3'
            WHEN days_to_first_read < 7 THEN '3-7'
            WHEN days_to_first_read < 14 THEN '7-14'
            WHEN days_to_first_read < 30 THEN '14-30'
            ELSE '30+'
          END AS days_range,
          COUNT(*)::int AS count,
          CASE
            WHEN days_to_first_read < 1 THEN 1
            WHEN days_to_first_read < 3 THEN 2
            WHEN days_to_first_read < 7 THEN 3
            WHEN days_to_first_read < 14 THEN 4
            WHEN days_to_first_read < 30 THEN 5
            ELSE 6
          END AS sort_order
        FROM first_read_days
        GROUP BY days_range, sort_order
        ORDER BY sort_order
      `
    );

    const summary = summaryRaw[0] || {
      users_with_first_read: 0,
      users_without_read: 0,
      avg_days_to_first_read: null,
    };

    res.json({
      period,
      usersWithFirstRead: Number(summary.users_with_first_read) || 0,
      usersWithoutRead: Number(summary.users_without_read) || 0,
      avgDaysToFirstRead: Math.round((Number(summary.avg_days_to_first_read) || 0) * 10) / 10,
      distribution: distributionRaw.map((item) => ({
        daysRange: item.days_range,
        count: Number(item.count) || 0,
      })),
    });
  } catch (error) {
    console.error('[Analytics] Error fetching user journey stats:', error);
    res.status(500).json({ error: 'Failed to fetch user journey stats' });
  }
});

/**
 * GET /api/v1/analytics/club/:clubId
 * Детальная аналитика по клубу (для админов)
 */
router.get('/club/:clubId', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const { period = '30d' } = req.query;

    // Вычисляем дату начала периода
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === 'all') {
      startDate = new Date('2020-01-01');
    }

    const [clubInfo] = await db
      .select({
        id: clubs.id,
        title: clubs.title,
      })
      .from(clubs)
      .where(eq(clubs.id, clubId))
      .limit(1);

    if (!clubInfo) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const [eventsSummary] = await db
      .select({
        totalEvents: count(),
        joinEvents: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'club_join')::int`,
        leaveEvents: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'club_leave')::int`,
        totalSessions: sql<number>`COUNT(*) FILTER (WHERE ${analyticsEvents.eventType} = 'reading_session')::int`,
        lastActivityAt: sql<Date | null>`MAX(${analyticsEvents.createdAt})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.clubId, clubId),
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, CLUB_ANALYTICS_EVENT_TYPES)
        )
      );

    const [activeMembersResult] = await db
      .select({ count: count() })
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.clubId, clubId),
          eq(clubMembers.isActive, true)
        )
      );

    const eventsTrend = await db
      .select({
        date: sql<string>`DATE(${analyticsEvents.createdAt})`,
        count: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.clubId, clubId),
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, CLUB_ANALYTICS_EVENT_TYPES)
        )
      )
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`)
      .orderBy(sql`DATE(${analyticsEvents.createdAt})`);

    const eventsByTypeRaw = await db
      .select({
        eventType: analyticsEvents.eventType,
        count: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.clubId, clubId),
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, CLUB_ANALYTICS_EVENT_TYPES)
        )
      )
      .groupBy(analyticsEvents.eventType)
      .orderBy(desc(count()));

    const eventsByType = eventsByTypeRaw.map((item) => ({
      eventType: item.eventType,
      count: Number(item.count) || 0,
    }));

    const recentEvents = await db
      .select({
        id: analyticsEvents.id,
        eventType: analyticsEvents.eventType,
        createdAt: analyticsEvents.createdAt,
        username: users.username,
        bookTitle: sql<string | null>`COALESCE(${personalBooks.title}, ${clubBooks.title}, ${books.title})`,
      })
      .from(analyticsEvents)
      .leftJoin(users, eq(analyticsEvents.userId, users.id))
      .leftJoin(books, eq(analyticsEvents.bookId, books.id))
      .leftJoin(personalBooks, eq(analyticsEvents.bookId, personalBooks.id))
      .leftJoin(clubBooks, eq(analyticsEvents.bookId, clubBooks.id))
      .where(
        and(
          eq(analyticsEvents.clubId, clubId),
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, CLUB_ANALYTICS_EVENT_TYPES)
        )
      )
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(30);

    res.json({
      clubId,
      clubTitle: clubInfo.title,
      period,
      totalEvents: Number(eventsSummary?.totalEvents) || 0,
      joinEvents: Number(eventsSummary?.joinEvents) || 0,
      leaveEvents: Number(eventsSummary?.leaveEvents) || 0,
      totalSessions: Number(eventsSummary?.totalSessions) || 0,
      activeMembers: Number(activeMembersResult?.count) || 0,
      lastActivityAt: eventsSummary?.lastActivityAt ? new Date(eventsSummary.lastActivityAt).toISOString() : null,
      eventsTrend,
      eventsByType,
      recentEvents,
    });
  } catch (error) {
    console.error('[Analytics] Error fetching club stats:', error);
    res.status(500).json({ error: 'Failed to fetch club analytics' });
  }
});

/**
 * GET /api/v1/analytics/user/:userId
 * Детальная аналитика по пользователю (для админов)
 */
router.get('/user/:userId', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { period = '30d' } = req.query;

    // Вычисляем дату начала периода
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === 'all') {
      startDate = new Date('2020-01-01');
    }

    const [userInfo] = await db
      .select({
        id: users.id,
        username: users.username,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userInfo) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [totalBooksStartedResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${analyticsEvents.bookId})` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate),
          eq(analyticsEvents.eventType, 'book_open'),
          sql`${analyticsEvents.bookId} IS NOT NULL`
        )
      );

    const [totalBooksCompletedResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${analyticsEvents.bookId})` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate),
          eq(analyticsEvents.eventType, 'book_complete'),
          sql`${analyticsEvents.bookId} IS NOT NULL`
        )
      );

    const [readingStatsResult] = await db
      .select({
        totalDuration: sql<number>`COALESCE(SUM(${analyticsEvents.duration}), 0)`,
        avgDuration: sql<number>`AVG(${analyticsEvents.duration})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate),
          eq(analyticsEvents.eventType, 'reading_session')
        )
      );

    const booksRaw = await db
      .select({
        bookId: analyticsEvents.bookId,
        title: sql<string>`COALESCE(${personalBooks.title}, ${clubBooks.title}, ${books.title}, 'Неизвестная книга')`,
        author: sql<string | null>`COALESCE(${personalBooks.author}, ${clubBooks.author}, ${books.author})`,
        events: count(),
        maxProgress: sql<number | null>`MAX(${analyticsEvents.progress})`,
        started: sql<boolean>`BOOL_OR(${analyticsEvents.eventType} = 'book_open')`,
        completed: sql<boolean>`BOOL_OR(${analyticsEvents.eventType} = 'book_complete')`,
        lastActivityAt: sql<Date | null>`MAX(${analyticsEvents.createdAt})`,
      })
      .from(analyticsEvents)
      .leftJoin(books, eq(analyticsEvents.bookId, books.id))
      .leftJoin(personalBooks, eq(analyticsEvents.bookId, personalBooks.id))
      .leftJoin(clubBooks, eq(analyticsEvents.bookId, clubBooks.id))
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate),
          sql`${analyticsEvents.bookId} IS NOT NULL`
        )
      )
      .groupBy(
        analyticsEvents.bookId,
        personalBooks.title,
        personalBooks.author,
        clubBooks.title,
        clubBooks.author,
        books.title,
        books.author
      )
      .orderBy(desc(sql`MAX(${analyticsEvents.createdAt})`))
      .limit(100);

    const userBooks = booksRaw
      .filter((item) => Boolean(item.bookId))
      .map((item) => {
        const completed = Boolean(item.completed);
        const maxProgress = Math.max(0, Math.min(100, Number(item.maxProgress) || 0));
        const progress = completed ? 100 : maxProgress;

        return {
          bookId: item.bookId as string,
          title: item.title,
          author: item.author || undefined,
          progress,
          events: Number(item.events) || 0,
          started: Boolean(item.started),
          completed,
          lastActivityAt: item.lastActivityAt ? new Date(item.lastActivityAt).toISOString() : null,
        };
      });

    const userClubsRaw = await db
      .select({
        clubId: clubMembers.clubId,
        clubTitle: clubs.title,
        role: clubMembers.role,
      })
      .from(clubMembers)
      .innerJoin(clubs, eq(clubMembers.clubId, clubs.id))
      .where(
        and(
          eq(clubMembers.userId, userId),
          eq(clubMembers.isActive, true)
        )
      );

    const userClubActivityRaw = await db
      .select({
        clubId: analyticsEvents.clubId,
        events: count(),
        lastActivityAt: sql<Date | null>`MAX(${analyticsEvents.createdAt})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate),
          sql`${analyticsEvents.clubId} IS NOT NULL`
        )
      )
      .groupBy(analyticsEvents.clubId);

    const clubActivityMap = new Map(
      userClubActivityRaw
        .filter((item) => Boolean(item.clubId))
        .map((item) => [
          item.clubId as string,
          {
            events: Number(item.events) || 0,
            lastActivityAt: item.lastActivityAt ? new Date(item.lastActivityAt).toISOString() : null,
          },
        ])
    );

    const clubsList = userClubsRaw
      .map((club) => {
        const activity = clubActivityMap.get(club.clubId);
        return {
          clubId: club.clubId,
          clubTitle: club.clubTitle,
          role: club.role,
          events: activity?.events || 0,
          lastActivityAt: activity?.lastActivityAt || null,
        };
      })
      .sort((a, b) => b.events - a.events || a.clubTitle.localeCompare(b.clubTitle, 'ru'));

    const activityTrend = await db
      .select({
        date: sql<string>`DATE(${analyticsEvents.createdAt})`,
        events: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`)
      .orderBy(sql`DATE(${analyticsEvents.createdAt})`);

    const eventsByTypeRaw = await db
      .select({
        eventType: analyticsEvents.eventType,
        count: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(analyticsEvents.eventType)
      .orderBy(desc(count()));

    const eventsByType = eventsByTypeRaw.map((item) => ({
      eventType: item.eventType,
      count: Number(item.count) || 0,
    }));

    const recentEvents = await db
      .select({
        id: analyticsEvents.id,
        eventType: analyticsEvents.eventType,
        createdAt: analyticsEvents.createdAt,
        bookTitle: sql<string | null>`COALESCE(${personalBooks.title}, ${clubBooks.title}, ${books.title})`,
        clubTitle: clubs.title,
      })
      .from(analyticsEvents)
      .leftJoin(books, eq(analyticsEvents.bookId, books.id))
      .leftJoin(personalBooks, eq(analyticsEvents.bookId, personalBooks.id))
      .leftJoin(clubBooks, eq(analyticsEvents.bookId, clubBooks.id))
      .leftJoin(clubs, eq(analyticsEvents.clubId, clubs.id))
      .where(
        and(
          eq(analyticsEvents.userId, userId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(40);

    const totalReadingTimeSeconds = Number(readingStatsResult?.totalDuration) || 0;

    res.json({
      userId: userInfo.id,
      username: userInfo.username,
      period,
      totalBooksStarted: Number(totalBooksStartedResult?.count) || 0,
      totalBooksCompleted: Number(totalBooksCompletedResult?.count) || 0,
      totalReadingTime: Math.round(totalReadingTimeSeconds / 60), // минуты
      avgSessionDuration: Math.round(Number(readingStatsResult?.avgDuration) || 0),
      books: userBooks,
      clubs: clubsList,
      activityTrend,
      eventsByType,
      recentEvents: recentEvents.map((event) => ({
        ...event,
        createdAt: new Date(event.createdAt).toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Analytics] Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user analytics' });
  }
});

/**
 * GET /api/v1/analytics/book/:bookId
 * Получение статистики по конкретной книге (для админов)
 */
router.get('/book/:bookId', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { bookId } = req.params;
    const { period = '30d' } = req.query;

    // Вычисляем дату начала периода
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === 'all') {
      startDate = new Date('2020-01-01');
    }

    // Общее количество открытий
    const [openCount] = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'book_open'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );

    // Количество завершений
    const [completeCount] = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'book_complete'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );

    // Уникальные читатели
    const [uniqueReaders] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${analyticsEvents.userId})` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'book_open'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );

    // Среднее время чтения
    const [avgTime] = await db
      .select({
        avgDuration: sql<number>`AVG(${analyticsEvents.duration})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'reading_session'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );

    // Средний прогресс
    const [avgProgress] = await db
      .select({
        avgProgress: sql<number>`AVG(${analyticsEvents.progress})`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'book_complete'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );

    // Популярные главы (события начала/завершения глав)
    const chapterStats = await db
      .select({
        chapterNumber: analyticsEvents.chapterNumber,
        eventType: analyticsEvents.eventType,
        events: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          inArray(analyticsEvents.eventType, ['chapter_start', 'chapter_complete']),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(analyticsEvents.chapterNumber, analyticsEvents.eventType);

    // Группируем по главам
    const chaptersMap = new Map<number, { start: number; complete: number }>();
    chapterStats.forEach((stat) => {
      if (stat.chapterNumber === null) return;
      const existing = chaptersMap.get(stat.chapterNumber) || { start: 0, complete: 0 };
      if (stat.eventType === 'chapter_start') {
        existing.start = Number(stat.events);
      } else if (stat.eventType === 'chapter_complete') {
        existing.complete = Number(stat.events);
      }
      chaptersMap.set(stat.chapterNumber, existing);
    });

    const popularChapters = Array.from(chaptersMap.entries())
      .map(([chapterNumber, data]) => ({
        chapterNumber,
        starts: data.start,
        completions: data.complete,
        completionRate: data.start > 0 ? Math.round((data.complete / data.start) * 100) : 0,
      }))
      .sort((a, b) => a.chapterNumber - b.chapterNumber);

    // Временной график активности по дням (общий)
    const eventsTrend = await db
      .select({
        date: sql<string>`DATE(${analyticsEvents.createdAt})`,
        count: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`)
      .orderBy(sql`DATE(${analyticsEvents.createdAt})`);

    // Детализация событий по дням (с разбивкой по типам)
    const dailyEvents = await db
      .select({
        date: sql<string>`DATE(${analyticsEvents.createdAt})`,
        eventType: analyticsEvents.eventType,
        count: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${analyticsEvents.createdAt})`, analyticsEvents.eventType)
      .orderBy(sql`DATE(${analyticsEvents.createdAt})`);

    // Группируем по датам
    const dailyEventsMap = new Map<string, { [key: string]: number }>();
    dailyEvents.forEach((event) => {
      const existing = dailyEventsMap.get(event.date) || {};
      existing[event.eventType] = Number(event.count);
      dailyEventsMap.set(event.date, existing);
    });

    const dailyEventsList = Array.from(dailyEventsMap.entries()).map(([date, events]) => ({
      date,
      ...events,
    }));

    // Топ читателей этой книги
    const topReaders = await db
      .select({
        userId: analyticsEvents.userId,
        username: users.username,
        events: count(),
      })
      .from(analyticsEvents)
      .leftJoin(users, eq(analyticsEvents.userId, users.id))
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          gte(analyticsEvents.createdAt, startDate)
        )
      )
      .groupBy(analyticsEvents.userId, users.username)
      .orderBy(desc(count()))
      .limit(10);

    // Получаем информацию о книге
    const [bookInfo] = await db
      .select({
        title: books.title,
        author: books.author,
        coverUrl: books.coverUrl,
      })
      .from(books)
      .where(eq(books.id, bookId));

    res.json({
      bookId,
      period,
      book: bookInfo || null,
      opens: openCount.count,
      completions: completeCount.count,
      uniqueReaders: uniqueReaders.count || 0,
      avgReadingTime: Math.round(avgTime.avgDuration || 0),
      avgProgress: Math.round(avgProgress.avgProgress || 0),
      completionRate: openCount.count > 0 ? Math.round((completeCount.count / openCount.count) * 100) : 0,
      popularChapters: popularChapters.slice(0, 30), // Ограничиваем 30 главами
      eventsTrend,
      dailyEvents: dailyEventsList,
      topReaders: topReaders.filter((r) => r.userId),
    });
  } catch (error) {
    console.error('[Analytics] Error fetching book stats:', error);
    res.status(500).json({ error: 'Failed to fetch book analytics' });
  }
});

/**
 * GET /api/v1/analytics/kpi
 * Получение KPI метрик эффективности проекта (только для админов)
 */
router.get('/kpi', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '30' } = req.query;
    const periodDays = Number.parseInt(period as string, 10) || 30;

    logger.info({ periodDays }, '[Analytics] Calculating KPIs');
    
    const kpis = await kpiCalculator.calculateKPIs(periodDays);

    res.json({
      period: `${periodDays}d`,
      timestamp: new Date().toISOString(),
      kpis,
    });
  } catch (error) {
    console.error('[Analytics] Error calculating KPIs:', error);
    res.status(500).json({ error: 'Failed to calculate KPIs' });
  }
});

export default router;
