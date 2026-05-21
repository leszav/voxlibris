import { eq, desc, inArray, and, lt } from 'drizzle-orm';
import { getDbConnection } from '../repositories/BaseRepository.js';
import { getRedisClient } from '../lib/redis.js';
import { getIO } from '../lib/socket-registry.js';
import { logger } from '../lib/logger.js';
import { repositories } from '../repositories/index.js';
import {
  activityEvents,
  users,
  userProfiles,
  userFollows,
  userMutes,
} from '../../shared/schema.js';
import type { ActivityEvent, ActivityEventType, ActivityEventWithActor } from '../../shared/schema.js';

// Ключи Redis
const FEED_KEY = (userId: string) => `feed:${userId}`;
const FEED_UNSEEN_KEY = (userId: string) => `feed_unseen:${userId}`;
const FEED_CAP = 500; // максимум событий в горячей ленте Redis

interface EmitPayload {
  actorId: string;
  eventType: ActivityEventType;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  visibility?: 'public' | 'followers' | 'private';
}

interface AchievementUnlockedPayload {
  actorId: string;
  achievementId: string;
  achievementName: string;
  achievementIcon?: string;
}

class ActivityService {
  /**
   * Сохранить событие в PostgreSQL, разослать в Redis-ленты подписчиков,
   * уведомить онлайн-подписчиков через Socket.IO.
   */
  async emit(payload: EmitPayload): Promise<void> {
    const { actorId, eventType, targetType, targetId, metadata, visibility = 'followers' } = payload;

    try {
      const db = getDbConnection();

      // 1. Персистентное хранилище
      const [event] = await db
        .insert(activityEvents)
        .values({
          actorId,
          eventType,
          targetType: targetType ?? null,
          targetId: targetId ?? null,
          metadata: metadata ?? null,
          visibility,
        })
        .returning();

      if (!event) {
        logger.warn('[ActivityService] event insert returned nothing');
        return;
      }

      // 2. Не рассылать приватные события
      if (visibility === 'private') return;

      // 3. Получить подписчиков актора (не более 500 для fan-out)
      const followerIds = await repositories.social.getFollowerIds(actorId);

      // Включить самого актора — он тоже видит свою ленту
      const targetUserIds = [...new Set([...followerIds, actorId])];

      // 4. Redis fan-out
      const redis = await getRedisClient();
      if (redis) {
        const score = event.createdAt.getTime();

        // Параллельная запись во все ленты
        await Promise.allSettled(
          targetUserIds.map(async (uid) => {
            const key = FEED_KEY(uid);
            await redis.zAdd(key, { score, value: event.id });
            // Обрезать до FEED_CAP самых новых
            await redis.zRemRangeByRank(key, 0, -(FEED_CAP + 1));
            // Счётчик непрочитанных (только для подписчиков, не для самого автора)
            if (uid !== actorId) {
              await redis.incr(FEED_UNSEEN_KEY(uid));
            }
          }),
        );
      }

      // 5. Socket.IO real-time (только онлайн-подписчики, не автор)
      try {
        const io = getIO();
        const actorWithProfile = await this.loadActors([event]);

        for (const uid of followerIds) {
          const unseenCount = redis
            ? Number(await redis.get(FEED_UNSEEN_KEY(uid))) || 0
            : 0;

          io.to(`user:${uid}`).emit('feed:new_event', {
            event: actorWithProfile[0],
            unseenCount,
          });
        }
      } catch {
        // Socket.IO может быть не инициализирован в тестах — не критично
      }
    } catch (error) {
      logger.error({ error: String(error) }, '[ActivityService.emit] failed');
    }
  }

  /**
   * Integration-ready helper для Sprint 3.1 (геймификация).
   * Вызывается в момент выдачи бейджа пользователю.
   */
  async emitAchievementUnlocked(payload: AchievementUnlockedPayload): Promise<void> {
    await this.emit({
      actorId: payload.actorId,
      eventType: 'achievement_unlocked',
      targetType: 'achievement',
      targetId: payload.achievementId,
      metadata: {
        achievementId: payload.achievementId,
        achievementName: payload.achievementName,
        achievementIcon: payload.achievementIcon ?? null,
      },
      visibility: 'followers',
    });
  }

  /**
   * Лента пользователя с cursor pagination.
   * Пробует Redis первым, fallback — PostgreSQL JOIN.
   */
  async getFeed(
    userId: string,
    limit = 20,
    cursor?: string,
  ): Promise<{ events: ActivityEventWithActor[]; nextCursor: string | null }> {
    const redis = await getRedisClient();

    if (redis) {
      return this.getFeedFromRedis(userId, limit, cursor);
    }
    return this.getFeedFromDb(userId, limit, cursor);
  }

  private async getFeedFromRedis(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ events: ActivityEventWithActor[]; nextCursor: string | null }> {
    try {
      const redis = await getRedisClient();
      if (!redis) throw new Error('no redis');

      const key = FEED_KEY(userId);

      // cursor — это score (timestamp) последнего полученного события
      const maxScore = cursor ? String(Number(cursor) - 1) : '+inf';

      const items = await redis.zRangeWithScores(key, maxScore, '-inf', {
        BY: 'SCORE',
        REV: true,
        LIMIT: { offset: 0, count: limit + 1 },
      });

      const hasMore = items.length > limit;
      const slice = hasMore ? items.slice(0, limit) : items;
      const eventIds = slice.map((i) => i.value);

      if (eventIds.length === 0) {
        return { events: [], nextCursor: null };
      }

      const db = getDbConnection();
      const rows = await db
        .select()
        .from(activityEvents)
        .where(inArray(activityEvents.id, eventIds))
        .orderBy(desc(activityEvents.createdAt));

      // Фильтровать замьюченных акторов
      const filteredRows = await this.filterMuted(userId, rows);
      const withActors = await this.loadActors(filteredRows);

      const lastItem = slice.at(-1);
      const nextCursor = hasMore && lastItem ? String(lastItem.score) : null;

      return { events: withActors, nextCursor };
    } catch (error) {
      logger.warn({ error: String(error) }, '[ActivityService] Redis feed failed, falling back to DB');
      return this.getFeedFromDb(userId, limit, cursor);
    }
  }

  private async getFeedFromDb(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ events: ActivityEventWithActor[]; nextCursor: string | null }> {
    const db = getDbConnection();

    const cursorDate = cursor ? new Date(Number(cursor)) : null;

    const followed = await db
      .select({ followingId: userFollows.followingId })
      .from(userFollows)
      .where(eq(userFollows.followerId, userId));

    const actorIds = [...new Set([userId, ...followed.map((row) => row.followingId)])];

    const rows = await db
      .select({ event: activityEvents })
      .from(activityEvents)
      .where(
        and(
          inArray(activityEvents.actorId, actorIds),
          cursorDate ? lt(activityEvents.createdAt, cursorDate) : undefined,
        ),
      )
      .orderBy(desc(activityEvents.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const events = slice.map((r) => r.event);

    const filtered = await this.filterMuted(userId, events);
    const withActors = await this.loadActors(filtered);

    const lastItem = slice.at(-1);
    const nextCursor = hasMore && lastItem
      ? String(lastItem.event.createdAt.getTime())
      : null;

    return { events: withActors, nextCursor };
  }

  /**
   * Публичная активность конкретного пользователя (для страницы профиля).
   */
  async getUserActivity(
    actorId: string,
    viewerId: string | null,
    limit = 20,
    cursor?: string,
  ): Promise<{ events: ActivityEventWithActor[]; nextCursor: string | null }> {
    const db = getDbConnection();

    // Определяем допустимую видимость
    const visibilities: Array<'public' | 'followers' | 'private'> = ['public'];
    if (viewerId) {
      const isFollowing = viewerId === actorId
        ? false
        : await repositories.social.isFollowing(viewerId, actorId);
      if (isFollowing || viewerId === actorId) {
        visibilities.push('followers');
      }
    }

    const cursorDate = cursor ? new Date(Number(cursor)) : null;

    const rows = await db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.actorId, actorId),
          inArray(activityEvents.visibility, visibilities),
          cursorDate ? lt(activityEvents.createdAt, cursorDate) : undefined,
        ),
      )
      .orderBy(desc(activityEvents.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const withActors = await this.loadActors(slice);

    const lastItem = slice.at(-1);
    const nextCursor = hasMore && lastItem
      ? String(lastItem.createdAt.getTime())
      : null;

    return { events: withActors, nextCursor };
  }

  /** Пометить ленту пользователя просмотренной. */
  async markFeedSeen(userId: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (redis) {
        await redis.set(FEED_UNSEEN_KEY(userId), '0');
      }
    } catch (error) {
      logger.warn({ error: String(error) }, '[ActivityService.markFeedSeen] failed');
    }
  }

  /** Число непрочитанных событий ленты. */
  async getUnseenCount(userId: string): Promise<number> {
    try {
      const redis = await getRedisClient();
      if (redis) {
        const val = await redis.get(FEED_UNSEEN_KEY(userId));
        return val ? Number(val) : 0;
      }
    } catch (error) {
      logger.warn({ error: String(error) }, '[ActivityService.getUnseenCount] failed');
    }
    return 0;
  }

  // ── Вспомогательные ───────────────────────────────────────────────────────

  private async filterMuted(userId: string, events: ActivityEvent[]): Promise<ActivityEvent[]> {
    if (events.length === 0) return events;
    try {
      const db = getDbConnection();
      const mutedRows = await db
        .select({ mutedId: userMutes.mutedId })
        .from(userMutes)
        .where(eq(userMutes.muterId, userId));
      const mutedSet = new Set(mutedRows.map((r: { mutedId: string }) => r.mutedId));
      return events.filter((e) => !mutedSet.has(e.actorId));
    } catch {
      return events;
    }
  }

  private async loadActors(events: ActivityEvent[]): Promise<ActivityEventWithActor[]> {
    if (events.length === 0) return [];

    const actorIds = [...new Set(events.map((e) => e.actorId))];
    const db = getDbConnection();

    const actorRows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: userProfiles.displayName,
        avatar: userProfiles.avatar,
        isReader: userProfiles.isReader,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(inArray(users.id, actorIds));

    const actorMap = new Map(actorRows.map((a) => [a.id, a]));

    return events
      .map((event) => {
        const actor = actorMap.get(event.actorId);
        if (!actor) return null;
        return {
          ...event,
          actor: {
            id: actor.id,
            username: actor.username,
            displayName: actor.displayName ?? null,
            avatar: actor.avatar ?? null,
            isReader: actor.isReader ?? false,
          },
        };
      })
      .filter((e): e is ActivityEventWithActor => e !== null);
  }
}

export const activityService = new ActivityService();
