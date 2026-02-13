import { repositories } from '../repositories/index.js';
import { logger } from '../lib/logger.js';
import type { SessionAnalytics } from '../../shared/schema.js';

/**
 * SessionAnalyticsService — сервис аналитики сессий чтения
 *
 * Отвечает за:
 * - Сбор статистики сессий в реальном времени
 * - Расчёт метрик (слушатели, удержание, география)
 * - Агрегацию данных для дашборда
 */

export interface ListenerEvent {
  userId: string;
  joinedAt: Date;
  leftAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  region?: string;
  city?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
}

export interface SessionMetrics {
  sessionId: string;
  peakListenerCount: number;
  averageListenerCount: number;
  totalListeners: number;
  totalListenTime: number; // в секундах
  averageSessionDuration: number; // в секундах
  reactionCount: number;
  positiveReactionCount: number;
  negativeReactionCount: number;
  questionCount: number;
  listenerRegions: Record<string, number>; // регион -> количество
  listenerCities: Record<string, number>; // город -> количество
  deviceTypes: Record<string, number>; // тип устройства -> количество
  retention: {
    '1min': number;
    '5min': number;
    '10min': number;
  };
  audioQualityScore: number; // 0-100
  networkQualityScore: number; // 0-100
}

class SessionAnalyticsService {
  // Хранилище активных сессий для отслеживания в реальном времени
  private readonly activeSessions: Map<string, Set<ListenerEvent>> = new Map();
  private readonly sessionStartedAt: Map<string, number> = new Map();
  private readonly MAX_TRACKED_SESSIONS = 500;
  private readonly MAX_LISTENER_EVENTS_PER_SESSION = 2000;
  private readonly SESSION_TTL_MS = 24 * 60 * 60 * 1000;

  private cleanupStaleSessions(nowMs: number = Date.now()): void {
    for (const [sessionId, startedAt] of this.sessionStartedAt.entries()) {
      if (nowMs - startedAt > this.SESSION_TTL_MS) {
        this.activeSessions.delete(sessionId);
        this.sessionStartedAt.delete(sessionId);
      }
    }
  }

  private enforceSessionLimit(): void {
    if (this.activeSessions.size <= this.MAX_TRACKED_SESSIONS) {
      return;
    }

    const oldestSessions = Array.from(this.sessionStartedAt.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, this.activeSessions.size - this.MAX_TRACKED_SESSIONS);

    for (const [sessionId] of oldestSessions) {
      this.activeSessions.delete(sessionId);
      this.sessionStartedAt.delete(sessionId);
    }
  }

  private trimListenerEvents(listeners: Set<ListenerEvent>): void {
    if (listeners.size <= this.MAX_LISTENER_EVENTS_PER_SESSION) {
      return;
    }

    const kept = Array.from(listeners)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
      .slice(listeners.size - this.MAX_LISTENER_EVENTS_PER_SESSION);

    listeners.clear();
    for (const event of kept) {
      listeners.add(event);
    }
  }

  /**
   * Инициализировать аналитику для новой сессии
   */
  async initializeSessionAnalytics(sessionId: string): Promise<void> {
    try {
      this.cleanupStaleSessions();

      await repositories.sessionAnalytics.createSessionAnalytics({
        sessionId,
        peakListenerCount: 0,
        averageListenerCount: 0,
        totalListeners: 0,
        totalListenTime: 0,
        averageSessionDuration: 0,
        reactionCount: 0,
        positiveReactionCount: 0,
        negativeReactionCount: 0,
        questionCount: 0,
        listenerRegions: '{}',
        listenerCities: '{}',
        deviceTypes: '{}',
        retention: '{}',
        audioQualityScore: 0,
        networkQualityScore: 0,
      });

      // Инициализируем хранилище для отслеживания слушателей
      this.activeSessions.set(sessionId, new Set());
      this.sessionStartedAt.set(sessionId, Date.now());
      this.enforceSessionLimit();

      logger.info(`Session analytics initialized for session ${sessionId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error initializing session analytics');
      throw new Error('Failed to initialize session analytics');
    }
  }

  /**
   * Зарегистрировать подключение слушателя
   */
  async trackListenerJoin(
    sessionId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      this.cleanupStaleSessions();

      const listeners = this.activeSessions.get(sessionId);
      if (!listeners) {
        return;
      }

      // Определяем регион и устройство
      const region = this.extractRegion(ipAddress);
      const city = this.extractCity(ipAddress);
      const deviceType = this.extractDeviceType(userAgent);

      const event: ListenerEvent = {
        userId,
        joinedAt: new Date(),
        ipAddress,
        userAgent,
        region,
        city,
        deviceType,
      };

      for (const existingEvent of listeners) {
        if (existingEvent.userId === userId && !existingEvent.leftAt) {
          return;
        }
      }

      listeners.add(event);
      this.trimListenerEvents(listeners);

      // Обновляем счётчик слушателей
      await this.updateListenerCount(sessionId);

      logger.debug(`Listener joined session ${sessionId}: ${userId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error tracking listener join');
    }
  }

  /**
   * Зарегистрировать отключение слушателя
   */
  async trackListenerLeave(sessionId: string, userId: string): Promise<void> {
    try {
      this.cleanupStaleSessions();

      const listeners = this.activeSessions.get(sessionId);
      if (!listeners) {
        return;
      }

      // Находим и обновляем событие
      for (const event of listeners) {
        if (event.userId === userId && !event.leftAt) {
          event.leftAt = new Date();
          break;
        }
      }

      // Обновляем счётчик слушателей
      await this.updateListenerCount(sessionId);

      logger.debug(`Listener left session ${sessionId}: ${userId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error tracking listener leave');
    }
  }

  /**
   * Обновить счётчик слушателей
   */
  private async updateListenerCount(sessionId: string): Promise<void> {
    try {
      const listeners = this.activeSessions.get(sessionId);
      if (!listeners) {
        return;
      }

      const currentCount = listeners.size;
      const analytics = await repositories.sessionAnalytics.getSessionAnalytics(sessionId);

      if (!analytics) {
        return;
      }

      // Обновляем пик слушателей
      const peakListenerCount = Math.max(analytics.peakListenerCount ?? 0, currentCount);

      // Обновляем среднее количество (скользящее среднее)
      const averageListenerCount = Math.round(
        ((analytics.averageListenerCount ?? 0) * 0.9 + currentCount * 0.1)
      );

      await repositories.sessionAnalytics.updateListenerStats(
        sessionId,
        peakListenerCount,
        averageListenerCount,
        (analytics.totalListeners ?? 0) + 1
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error updating listener count');
    }
  }

  /**
   * Отследить реакцию
   */
  async trackReaction(sessionId: string, isPositive: boolean): Promise<void> {
    try {
      const analytics = await repositories.sessionAnalytics.getSessionAnalytics(sessionId);
      if (!analytics) {
        return;
      }

      const reactionCount = (analytics.reactionCount ?? 0) + 1;
      const positiveReactionCount = isPositive
        ? (analytics.positiveReactionCount ?? 0) + 1
        : (analytics.positiveReactionCount ?? 0);
      const negativeReactionCount = isPositive
        ? (analytics.negativeReactionCount ?? 0)
        : (analytics.negativeReactionCount ?? 0) + 1;

      await repositories.sessionAnalytics.updateReactionQuestionStats(
        sessionId,
        reactionCount,
        positiveReactionCount,
        negativeReactionCount,
        analytics.questionCount ?? 0
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error tracking reaction');
    }
  }

  /**
   * Отследить вопрос
   */
  async trackQuestion(sessionId: string): Promise<void> {
    try {
      const analytics = await repositories.sessionAnalytics.getSessionAnalytics(sessionId);
      if (!analytics) {
        return;
      }

      await repositories.sessionAnalytics.updateReactionQuestionStats(
        sessionId,
        analytics.reactionCount ?? 0,
        analytics.positiveReactionCount ?? 0,
        analytics.negativeReactionCount ?? 0,
        (analytics.questionCount ?? 0) + 1
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error tracking question');
    }
  }

  /**
   * Обновить качество аудио
   */
  async updateAudioQuality(sessionId: string, score: number): Promise<void> {
    try {
      const analytics = await repositories.sessionAnalytics.getSessionAnalytics(sessionId);
      if (!analytics) {
        return;
      }

      // Скользящее среднее для сглаживания
      const audioQualityScore = Math.round(
        ((analytics.audioQualityScore ?? 0) * 0.8 + score * 0.2)
      );

      await repositories.sessionAnalytics.updateQualityScores(
        sessionId,
        audioQualityScore,
        analytics.networkQualityScore ?? 0
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error updating audio quality');
    }
  }

  /**
   * Обновить качество сети
   */
  async updateNetworkQuality(sessionId: string, score: number): Promise<void> {
    try {
      const analytics = await repositories.sessionAnalytics.getSessionAnalytics(sessionId);
      if (!analytics) {
        return;
      }

      // Скользящее среднее для сглаживания
      const networkQualityScore = Math.round(
        ((analytics.networkQualityScore ?? 0) * 0.8 + score * 0.2)
      );

      await repositories.sessionAnalytics.updateQualityScores(
        sessionId,
        analytics.audioQualityScore ?? 0,
        networkQualityScore
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error updating network quality');
    }
  }

  /**
   * Финализировать аналитику сессии
   */
  async finalizeSessionAnalytics(sessionId: string): Promise<SessionMetrics> {
    try {
      const listeners = this.activeSessions.get(sessionId);
      if (!listeners) {
        throw new Error(`Session ${sessionId} not found in active sessions`);
      }

      // Рассчитываем метрики
      const metrics = await this.calculateMetrics(sessionId, Array.from(listeners));

      // Обновляем аналитику в БД
      await repositories.sessionAnalytics.updateListenerStats(
        sessionId,
        metrics.peakListenerCount,
        metrics.averageListenerCount,
        metrics.totalListeners
      );

      await repositories.sessionAnalytics.updateListenTime(
        sessionId,
        metrics.totalListenTime,
        metrics.averageSessionDuration
      );

      await repositories.sessionAnalytics.updateMetadata(sessionId, {
        listenerRegions: JSON.stringify(metrics.listenerRegions),
        listenerCities: JSON.stringify(metrics.listenerCities),
        deviceTypes: JSON.stringify(metrics.deviceTypes),
        retention: JSON.stringify(metrics.retention),
      });

      // Очищаем хранилище
      this.activeSessions.delete(sessionId);
      this.sessionStartedAt.delete(sessionId);

      logger.info(`Session analytics finalized for session ${sessionId}`);

      return metrics;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error finalizing session analytics');
      throw new Error('Failed to finalize session analytics');
    }
  }

  /**
   * Рассчитать метрики сессии
   */
  private async calculateMetrics(sessionId: string, listeners: ListenerEvent[]): Promise<SessionMetrics> {
    const analytics = await repositories.sessionAnalytics.getSessionAnalytics(sessionId);
    if (!analytics) {
      throw new Error(`Analytics not found for session ${sessionId}`);
    }

    const stats = this.initListenerStats();
    for (const listener of listeners) {
      this.accumulateListenerStats(stats, listener);
    }

    // Среднее количество слушателей (приблизительно)
    const averageListenerCount =
      listeners.length > 0 ? Math.round(stats.totalSessionDuration / 300) : 0;

    // Средняя длительность сессии
    const averageSessionDuration = listeners.length > 0
      ? Math.round(stats.totalSessionDuration / listeners.length)
      : 0;

    return {
      sessionId,
      peakListenerCount: Math.max(analytics.peakListenerCount ?? 0, listeners.length),
      averageListenerCount: Math.max(analytics.averageListenerCount ?? 0, averageListenerCount),
      totalListeners: analytics.totalListeners ?? 0,
      totalListenTime: stats.totalListenTime,
      averageSessionDuration,
      reactionCount: analytics.reactionCount ?? 0,
      positiveReactionCount: analytics.positiveReactionCount ?? 0,
      negativeReactionCount: analytics.negativeReactionCount ?? 0,
      questionCount: analytics.questionCount ?? 0,
      listenerRegions: stats.listenerRegions,
      listenerCities: stats.listenerCities,
      deviceTypes: stats.deviceTypes,
      retention: stats.retention,
      audioQualityScore: analytics.audioQualityScore ?? 0,
      networkQualityScore: analytics.networkQualityScore ?? 0,
    };
  }

  private initListenerStats() {
    return {
      totalListenTime: 0,
      totalSessionDuration: 0,
      listenerRegions: {} as Record<string, number>,
      listenerCities: {} as Record<string, number>,
      deviceTypes: {
        desktop: 0,
        mobile: 0,
        tablet: 0,
      } as Record<string, number>,
      retention: {
        '1min': 0,
        '5min': 0,
        '10min': 0,
      } as SessionMetrics['retention'],
    };
  }

  private accumulateListenerStats(
    stats: ReturnType<SessionAnalyticsService['initListenerStats']>,
    listener: ListenerEvent
  ): void {
    const duration = this.calculateListenerDuration(listener);
    stats.totalListenTime += duration;
    stats.totalSessionDuration += duration;

    this.incrementCount(stats.listenerRegions, listener.region);
    this.incrementCount(stats.listenerCities, listener.city);
    this.incrementCount(stats.deviceTypes, listener.deviceType);
    this.updateRetention(stats.retention, duration);
  }

  private calculateListenerDuration(listener: ListenerEvent): number {
    if (!listener.leftAt) {
      return 0;
    }
    return Math.floor((listener.leftAt.getTime() - listener.joinedAt.getTime()) / 1000);
  }

  private incrementCount(map: Record<string, number>, key?: string): void {
    if (!key) return;
    map[key] = (map[key] ?? 0) + 1;
  }

  private updateRetention(retention: SessionMetrics['retention'], duration: number): void {
    if (duration >= 60) retention['1min']++;
    if (duration >= 300) retention['5min']++;
    if (duration >= 600) retention['10min']++;
  }

  /**
   * Получить аналитику сессии
   */
  async getSessionAnalytics(sessionId: string): Promise<SessionAnalytics | undefined> {
    try {
      return await repositories.sessionAnalytics.getSessionAnalytics(sessionId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting session analytics');
      throw new Error('Failed to get session analytics');
    }
  }

  /**
   * Получить аналитику клуба
   */
  async getClubAnalytics(clubId: string): Promise<{
    totalSessions: number;
    totalListeners: number;
    averageListeners: number;
    totalReactions: number;
    totalQuestions: number;
    averageQuality: number;
  }> {
    try {
      const sessions = await repositories.reading.getSessionsByClub(clubId);
      const analyticsList: SessionAnalytics[] = [];

      for (const session of sessions) {
        const analytics = await repositories.sessionAnalytics.getSessionAnalytics(session.id);
        if (analytics) {
          analyticsList.push(analytics);
        }
      }

      const totalSessions = analyticsList.length;
      const totalListeners = analyticsList.reduce((sum, a) => sum + (a.totalListeners ?? 0), 0);
      const averageListeners = totalSessions > 0 ? Math.round(totalListeners / totalSessions) : 0;
      const totalReactions = analyticsList.reduce((sum, a) => sum + (a.reactionCount ?? 0), 0);
      const totalQuestions = analyticsList.reduce((sum, a) => sum + (a.questionCount ?? 0), 0);
      const averageQuality =
        totalSessions > 0
          ? Math.round(
              analyticsList.reduce(
                (sum, a) => sum + (a.audioQualityScore ?? 0) + (a.networkQualityScore ?? 0),
                0
              ) /
                (totalSessions * 2)
            )
          : 0;

      return {
        totalSessions,
        totalListeners,
        averageListeners,
        totalReactions,
        totalQuestions,
        averageQuality,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting club analytics');
      throw new Error('Failed to get club analytics');
    }
  }

  /**
   * Извлечь регион из IP-адреса (упрощённая реализация)
   */
  private extractRegion(ipAddress?: string): string | undefined {
    return this.extractGeoValue('region', ipAddress);
  }

  /**
   * Извлечь город из IP-адреса (упрощённая реализация)
   */
  private extractCity(ipAddress?: string): string | undefined {
    return this.extractGeoValue('city', ipAddress);
  }

  private extractGeoValue(_scope: 'region' | 'city', ipAddress?: string): string | undefined {
    if (!ipAddress) return undefined;
    // В реальном приложении здесь будет интеграция с GeoIP сервисом
    return 'Unknown';
  }

  /**
   * Извлечь тип устройства из User-Agent
   */
  private extractDeviceType(userAgent?: string): 'desktop' | 'mobile' | 'tablet' {
    if (!userAgent) return 'desktop';

    const ua = userAgent.toLowerCase();

    if (/mobile|android|iphone|ipod/i.test(ua) && !/tablet|ipad/i.test(ua)) {
      return 'mobile';
    }
    if (/tablet|ipad/i.test(ua)) {
      return 'tablet';
    }
    return 'desktop';
  }
}

// Экспортируем singleton
export const sessionAnalyticsService = new SessionAnalyticsService();
