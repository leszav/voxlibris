import { Router, Request, Response } from 'express';
import { db } from './db.js';
import { analyticsEvents, books, users, clubs, type InsertAnalyticsEvent } from '../shared/schema.js';
import { jwtAuth, requireAdmin } from './jwt-middleware.js';
import { eq, sql, and, gte, desc, count, inArray } from 'drizzle-orm';
import { kpiCalculator } from './analytics/kpi-calculator.js';

const router = Router();

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

    // Топ-10 самых читаемых книг
    const topBooks = await db
      .select({
        bookId: analyticsEvents.bookId,
        title: books.title,
        author: books.author,
        events: count(),
      })
      .from(analyticsEvents)
      .leftJoin(books, eq(analyticsEvents.bookId, books.id))
      .where(
        and(
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, ['book_open', 'reading_session', 'chapter_complete'])
        )
      )
      .groupBy(analyticsEvents.bookId, books.title, books.author)
      .orderBy(desc(count()))
      .limit(10);

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

    // Статистика по клубам
    const clubStats = await db
      .select({
        clubId: analyticsEvents.clubId,
        events: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, startDate),
          inArray(analyticsEvents.eventType, ['club_join', 'club_leave'])
        )
      )
      .groupBy(analyticsEvents.clubId);

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

    res.json({
      period,
      totalEvents: totalEventsResult.count,
      eventsByType,
      topBooks: topBooks.filter((b: any) => b.bookId), // Убираем записи без книг
      topUsers: topUsers.filter((u: any) => u.userId), // Убираем записи без пользователей
      clubStats,
      avgReadingTime: Math.round(avgReadingTimeResult.avgDuration || 0),
      eventsTrend,
    });
  } catch (error) {
    console.error('[Analytics] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch analytics stats' });
  }
});

/**
 * GET /api/v1/analytics/book/:bookId
 * Получение статистики по конкретной книге (для админов)
 */
router.get('/book/:bookId', jwtAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { bookId } = req.params;

    // Общее количество открытий
    const [openCount] = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'book_open')
        )
      );

    // Количество завершений
    const [completeCount] = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          eq(analyticsEvents.eventType, 'book_complete')
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
          eq(analyticsEvents.eventType, 'reading_session')
        )
      );

    // Популярные главы
    const popularChapters = await db
      .select({
        chapterNumber: analyticsEvents.chapterNumber,
        events: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.bookId, bookId),
          inArray(analyticsEvents.eventType, ['chapter_start', 'chapter_complete'])
        )
      )
      .groupBy(analyticsEvents.chapterNumber)
      .orderBy(desc(count()));

    res.json({
      bookId,
      opens: openCount.count,
      completions: completeCount.count,
      avgReadingTime: Math.round(avgTime.avgDuration || 0),
      popularChapters: popularChapters.filter((c: any) => c.chapterNumber),
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
    const periodDays = parseInt(period as string, 10) || 30;

    console.log(`[Analytics] Calculating KPIs for period: ${periodDays} days`);
    
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
