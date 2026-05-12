import { getRedisClient } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

const PRESENCE_TTL_SECONDS = 30;

function presenceClubKey(clubId: string): string {
  return `presence:club:${clubId}:users`;
}

function presenceUserClubsKey(userId: string): string {
  return `presence:user:${userId}:clubs`;
}

type FallbackClubMap = Map<string, number>;
const fallbackPresence = new Map<string, FallbackClubMap>();

function nowMs(): number {
  return Date.now();
}

function pruneFallbackExpired(clubId: string): void {
  const users = fallbackPresence.get(clubId);
  if (!users) return;

  const now = nowMs();
  for (const [userId, expiresAt] of users.entries()) {
    if (expiresAt <= now) {
      users.delete(userId);
    }
  }

  if (users.size === 0) {
    fallbackPresence.delete(clubId);
  }
}

function markFallbackOnline(clubId: string, userId: string): void {
  pruneFallbackExpired(clubId);
  const users = fallbackPresence.get(clubId) ?? new Map<string, number>();
  users.set(userId, nowMs() + PRESENCE_TTL_SECONDS * 1000);
  fallbackPresence.set(clubId, users);
}

function removeFallbackUserFromClub(clubId: string, userId: string): void {
  const users = fallbackPresence.get(clubId);
  if (!users) return;
  users.delete(userId);
  if (users.size === 0) {
    fallbackPresence.delete(clubId);
  }
}

async function getRedisOnlineUserIds(clubId: string): Promise<string[] | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  const key = presenceClubKey(clubId);
  const now = nowMs();

  try {
    await redis.zRemRangeByScore(key, '-inf', String(now));
    const userIds = await redis.zRange(key, 0, -1);
    return userIds;
  } catch (error) {
    logger.warn({ error, clubId }, '[presence] failed to read Redis presence, fallback to memory');
    return null;
  }
}

export class PresenceService {
  async markOnlineInClub(clubId: string, userId: string): Promise<void> {
    const redis = await getRedisClient();
    const expiresAtMs = nowMs() + PRESENCE_TTL_SECONDS * 1000;

    if (!redis) {
      markFallbackOnline(clubId, userId);
      return;
    }

    const clubKey = presenceClubKey(clubId);
    const userClubsKey = presenceUserClubsKey(userId);

    try {
      await redis.multi()
        .zAdd(clubKey, { score: expiresAtMs, value: userId })
        .expire(clubKey, PRESENCE_TTL_SECONDS + 5)
        .sAdd(userClubsKey, clubId)
        .expire(userClubsKey, PRESENCE_TTL_SECONDS + 120)
        .exec();
    } catch (error) {
      logger.warn({ error, clubId, userId }, '[presence] failed to write Redis presence, fallback to memory');
      markFallbackOnline(clubId, userId);
    }
  }

  async leaveClub(clubId: string, userId: string): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) {
      removeFallbackUserFromClub(clubId, userId);
      return;
    }

    const clubKey = presenceClubKey(clubId);
    const userClubsKey = presenceUserClubsKey(userId);

    try {
      await redis.multi()
        .zRem(clubKey, userId)
        .sRem(userClubsKey, clubId)
        .exec();
    } catch (error) {
      logger.warn({ error, clubId, userId }, '[presence] failed to remove Redis presence, fallback to memory');
      removeFallbackUserFromClub(clubId, userId);
    }
  }

  async leaveAllClubs(userId: string): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) {
      for (const [clubId] of fallbackPresence.entries()) {
        removeFallbackUserFromClub(clubId, userId);
      }
      return;
    }

    const userClubsKey = presenceUserClubsKey(userId);

    try {
      const clubIds = await redis.sMembers(userClubsKey);
      if (clubIds.length === 0) return;

      const tx = redis.multi();
      for (const clubId of clubIds) {
        tx.zRem(presenceClubKey(clubId), userId);
      }
      tx.del(userClubsKey);
      await tx.exec();
    } catch (error) {
      logger.warn({ error, userId }, '[presence] failed to clear Redis presence for user, fallback to memory');
      for (const [clubId] of fallbackPresence.entries()) {
        removeFallbackUserFromClub(clubId, userId);
      }
    }
  }

  async getClubOnlineUserIds(clubId: string): Promise<string[]> {
    const fromRedis = await getRedisOnlineUserIds(clubId);
    if (fromRedis) return fromRedis;

    pruneFallbackExpired(clubId);
    return Array.from(fallbackPresence.get(clubId)?.keys() ?? []);
  }
}

export const presenceService = new PresenceService();
