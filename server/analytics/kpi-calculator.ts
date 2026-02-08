/**
 * KPI Calculator - Вычисление ключевых показателей эффективности VoxLibris
 */

import { db } from '../db.js';
import { 
  users, 
  books, 
  personalBooks,
  clubs, 
  clubMembers, 
  readingProgress,
  analyticsEvents 
} from '../../shared/schema.js';
import { sql, count, avg, sum, gte, eq, and, lte } from 'drizzle-orm';

export interface ProjectKPIs {
  // Пользовательские метрики
  totalUsers: number;
  activeUsers: number; // активны за последние 30 дней
  newUsersThisMonth: number;
  userRetention: number; // % пользователей, вернувшихся через неделю
  avgSessionDuration: number; // в минутах
  
  // Контентные метрики
  totalBooks: number;
  personalBooksCount: number;
  booksReadThisMonth: number;
  avgReadingProgress: number; // средний прогресс по всем книгам (0-100)
  completionRate: number; // % завершенных книг
  
  // Клубные метрики
  totalClubs: number;
  activeClubs: number; // с активностью за последние 30 дней
  avgClubSize: number;
  clubEngagement: number; // среднее количество событий на клуб
  
  // Бизнес метрики
  conversionRate: number; // % пользователей, которые начали читать
  readerUtilization: number; // % пользователей с активным чтением
  contentGrowth: number; // рост контента за месяц (%)
  
  // Метрики активности
  totalReadingSessions: number;
  totalReadingTime: number; // в часах
  avgBooksPerUser: number;
  avgChaptersPerBook: number;
}

/**
 * Класс для вычисления KPI метрик проекта
 */
export class KPICalculator {
  /**
   * Вычисляет все KPI метрики за указанный период
   * @param period - период в днях (по умолчанию 30)
   */
  async calculateKPIs(period: number = 30): Promise<ProjectKPIs> {
    const startDate = this.getPeriodStartDate(period);
    
    const [
      userMetrics,
      contentMetrics,
      clubMetrics,
      businessMetrics,
      activityMetrics
    ] = await Promise.all([
      this.calculateUserMetrics(startDate),
      this.calculateContentMetrics(startDate),
      this.calculateClubMetrics(startDate),
      this.calculateBusinessMetrics(startDate),
      this.calculateActivityMetrics(startDate)
    ]);

    return {
      ...userMetrics,
      ...contentMetrics,
      ...clubMetrics,
      ...businessMetrics,
      ...activityMetrics
    };
  }

  /**
   * Вычисление пользовательских метрик
   */
  private async calculateUserMetrics(startDate: Date) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Общее количество пользователей
    const totalUsersResult = await db
      .select({ count: count() })
      .from(users);
    const totalUsers = totalUsersResult[0]?.count || 0;

    // Активные пользователи (с событиями за последние 30 дней)
    const activeUsersResult = await db
      .selectDistinct({ userId: analyticsEvents.userId })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, thirtyDaysAgo));
    const activeUsers = activeUsersResult.filter((u: { userId: string | null }) => u.userId !== null).length;

    // Новые пользователи за месяц
    const newUsersResult = await db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, startDate));
    const newUsersThisMonth = newUsersResult[0]?.count || 0;

    // Удержание: пользователи, которые вернулись через неделю
    const weekOldUsersResult = await db
      .select({ id: users.id })
      .from(users)
      .where(gte(users.createdAt, sevenDaysAgo));
    const weekOldUsers = weekOldUsersResult.length;

    const returnedUsersResult = await db
      .selectDistinct({ userId: analyticsEvents.userId })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, new Date()));
    
    const returnedUsers = returnedUsersResult.filter((u: { userId: string | null }) => 
      u.userId && weekOldUsersResult.some((w: { id: string }) => w.id === u.userId)
    ).length;
    
    const userRetention = weekOldUsers > 0 
      ? Math.round((returnedUsers / weekOldUsers) * 100) 
      : 0;

    // Средняя длительность сессии (из reading_session событий)
    const avgSessionResult = await db
      .select({ count: count(), totalDuration: sum(analyticsEvents.duration) })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'reading_session'),
          gte(analyticsEvents.createdAt, thirtyDaysAgo)
        )
      );
    
    const avgSessionDuration = avgSessionResult[0]?.count && avgSessionResult[0]?.count > 0
      ? Math.round(Number(avgSessionResult[0]?.totalDuration) / 60 / avgSessionResult[0]?.count)
      : 0;

    return {
      totalUsers,
      activeUsers,
      newUsersThisMonth,
      userRetention,
      avgSessionDuration
    };
  }

  /**
   * Вычисление контентных метрик
   */
  private async calculateContentMetrics(startDate: Date) {
    // Общее количество книг
    const totalBooksResult = await db
      .select({ count: count() })
      .from(books);
    const totalBooks = totalBooksResult[0]?.count || 0;

    // Личные книги пользователей
    const personalBooksResult = await db
      .select({ count: count() })
      .from(personalBooks);
    const personalBooksCount = personalBooksResult[0]?.count || 0;

    // Книги, прочитанные за месяц (хотя бы одно событие book_open)
    const booksReadResult = await db
      .selectDistinct({ bookId: analyticsEvents.bookId })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'book_open'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );
    const booksReadThisMonth = booksReadResult.filter((b: { bookId: string | null }) => b.bookId !== null).length;

    // Средний прогресс чтения
    const progressResult = await db
      .select({ avgProgress: avg(readingProgress.progress) })
      .from(readingProgress);
    const avgReadingProgress = Math.round(Number(progressResult[0]?.avgProgress) || 0);

    // Процент завершённых книг
    const completedBooksResult = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'book_complete'),
          gte(analyticsEvents.createdAt, startDate)
        )
      );
    const completedBooks = completedBooksResult[0]?.count || 0;
    
    const completionRate = booksReadThisMonth > 0
      ? Math.round((completedBooks / booksReadThisMonth) * 100)
      : 0;

    return {
      totalBooks,
      personalBooksCount,
      booksReadThisMonth,
      avgReadingProgress,
      completionRate
    };
  }

  /**
   * Вычисление клубных метрик
   */
  private async calculateClubMetrics(_startDate: Date) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Общее количество клубов
    const totalClubsResult = await db
      .select({ count: count() })
      .from(clubs);
    const totalClubs = totalClubsResult[0]?.count || 0;

    // Активные клубы (с событиями за последние 30 дней)
    const activeClubsResult = await db
      .selectDistinct({ clubId: analyticsEvents.clubId })
      .from(analyticsEvents)
      .where(
        and(
          sql`${analyticsEvents.clubId} IS NOT NULL`,
          gte(analyticsEvents.createdAt, thirtyDaysAgo)
        )
      );
    const activeClubs = activeClubsResult.length;

    // Средний размер клуба
    const clubSizeResult = await db
      .select({ avgSize: avg(sql<number>`(SELECT COUNT(*) FROM ${clubMembers} WHERE club_id = ${clubs.id})`) })
      .from(clubs);
    const avgClubSize = Math.round(Number(clubSizeResult[0]?.avgSize) || 0);

    // Средняя активность клубов (событий на клуб)
    const clubEventsResult = await db
      .select({ totalEvents: count() })
      .from(analyticsEvents)
      .where(
        and(
          sql`${analyticsEvents.clubId} IS NOT NULL`,
          gte(analyticsEvents.createdAt, thirtyDaysAgo)
        )
      );
    const totalClubEvents = clubEventsResult[0]?.totalEvents || 0;
    
    const clubEngagement = activeClubs > 0
      ? Math.round(totalClubEvents / activeClubs)
      : 0;

    return {
      totalClubs,
      activeClubs,
      avgClubSize,
      clubEngagement
    };
  }

  /**
   * Вычисление бизнес-метрик
   */
  private async calculateBusinessMetrics(_startDate: Date) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Общее количество пользователей
    const totalUsersResult = await db
      .select({ count: count() })
      .from(users);
    const totalUsers = totalUsersResult[0]?.count || 0;

    // Пользователи, которые начали читать (хотя бы одно событие book_open)
    const readersResult = await db
      .selectDistinct({ userId: analyticsEvents.userId })
      .from(analyticsEvents)
      .where(sql`${analyticsEvents.eventType} = 'book_open' AND ${analyticsEvents.userId} IS NOT NULL`);
    const readers = readersResult.length;

    // Конверсия в читателей
    const conversionRate = totalUsers > 0
      ? Math.round((readers / totalUsers) * 100)
      : 0;

    // Активные читатели (читали за последние 30 дней)
    const activeReadersResult = await db
      .selectDistinct({ userId: analyticsEvents.userId })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'reading_session'),
          gte(analyticsEvents.createdAt, thirtyDaysAgo)
        )
      );
    const activeReaders = activeReadersResult.filter((u: { userId: string | null }) => u.userId !== null).length;

    // Утилизация читателей
    const readerUtilization = readers > 0
      ? Math.round((activeReaders / readers) * 100)
      : 0;

    // Рост контента (сравнение за 30 и 60 дней)
    const booksLastMonthResult = await db
      .select({ count: count() })
      .from(books)
      .where(gte(books.createdAt, thirtyDaysAgo));
    const booksLastMonth = booksLastMonthResult[0]?.count || 0;

    const booksPreviousMonthResult = await db
      .select({ count: count() })
      .from(books)
      .where(
        and(
          gte(books.createdAt, sixtyDaysAgo),
          lte(books.createdAt, thirtyDaysAgo)
        )
      );
    const booksPreviousMonth = booksPreviousMonthResult[0]?.count || 0;

    const contentGrowth = booksPreviousMonth > 0
      ? Math.round(((booksLastMonth - booksPreviousMonth) / booksPreviousMonth) * 100)
      : 0;

    return {
      conversionRate,
      readerUtilization,
      contentGrowth
    };
  }

  /**
   * Вычисление метрик активности
   */
  private async calculateActivityMetrics(_startDate: Date) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Общее количество сессий чтения
    const sessionsResult = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'reading_session'),
          gte(analyticsEvents.createdAt, thirtyDaysAgo)
        )
      );
    const totalReadingSessions = sessionsResult[0]?.count || 0;

    // Общее время чтения (в часах)
    const readingTimeResult = await db
      .select({ totalDuration: sum(analyticsEvents.duration) })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'reading_session'),
          gte(analyticsEvents.createdAt, thirtyDaysAgo)
        )
      );
    const totalReadingTime = Math.round(
      (Number(readingTimeResult[0]?.totalDuration) || 0) / 3600
    ); // конвертируем в часы

    // Среднее количество книг на пользователя
    const totalUsersResult = await db
      .select({ count: count() })
      .from(users);
    const totalUsers = totalUsersResult[0]?.count || 0;

    const totalBooksResult = await db
      .select({ count: count() })
      .from(books);
    const totalBooks = totalBooksResult[0]?.count || 0;

    const avgBooksPerUser = totalUsers > 0
      ? Math.round((totalBooks / totalUsers) * 10) / 10
      : 0;

    // Среднее количество глав на книгу (из personalBooks)
    // Примечание: колонка chapters не существует в таблице personal_books
    // Этот KPI невозможно вычислить с текущей структурой БД
    const avgChaptersPerBook = 0;

    return {
      totalReadingSessions,
      totalReadingTime,
      avgBooksPerUser,
      avgChaptersPerBook
    };
  }

  /**
   * Получить дату начала периода
   */
  private getPeriodStartDate(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }
}

// Экспортируем синглтон
export const kpiCalculator = new KPICalculator();
