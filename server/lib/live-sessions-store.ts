import { getRedisClient } from './redis.js';

const LIVE_SESSION_TTL_SECONDS = Number.parseInt(process.env.LIVE_SESSION_TTL_SECONDS || '90', 10);

export interface LiveReaderEntry {
  sessionId: string;
  readerId: string;
  readerName: string;
  chapter: number;
  positionRaw?: string;
  streamUrl: string;
  startedAt: string;
  clubId: string;
  bookId: string;
}

function sessionKey(sessionId: string): string {
  return `vl:live:session:${sessionId}`;
}

function clubKey(clubId: string): string {
  return `vl:live:club:${clubId}`;
}

export class LiveSessionsStore {
  async upsert(entry: LiveReaderEntry): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;

    const key = sessionKey(entry.sessionId);
    await redis.multi()
      .set(key, JSON.stringify(entry), { EX: LIVE_SESSION_TTL_SECONDS })
      .sAdd(clubKey(entry.clubId), entry.sessionId)
      .expire(clubKey(entry.clubId), LIVE_SESSION_TTL_SECONDS)
      .exec();
  }

  async get(sessionId: string): Promise<LiveReaderEntry | null> {
    const redis = await getRedisClient();
    if (!redis) return null;

    const raw = await redis.get(sessionKey(sessionId));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as LiveReaderEntry;
    } catch {
      return null;
    }
  }

  async getByClub(clubId: string): Promise<LiveReaderEntry[]> {
    const redis = await getRedisClient();
    if (!redis) return [];

    const sessionIds = await redis.sMembers(clubKey(clubId));
    if (sessionIds.length === 0) return [];

    const entries = await Promise.all(sessionIds.map((id) => this.get(id)));
    const activeEntries = entries.filter((entry): entry is LiveReaderEntry => entry !== null);
    const staleSessionIds = sessionIds.filter((id) => !activeEntries.some((entry) => entry.sessionId === id));

    if (staleSessionIds.length > 0) {
      await redis.sRem(clubKey(clubId), staleSessionIds);
    }

    return activeEntries;
  }

  async remove(sessionId: string, clubId?: string): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;

    const existing = clubId ? null : await this.get(sessionId);
    const targetClubId = clubId || existing?.clubId;

    const multi = redis.multi().del(sessionKey(sessionId));
    if (targetClubId) {
      multi.sRem(clubKey(targetClubId), sessionId);
    }
    await multi.exec();
  }

  async updatePosition(sessionId: string, chapter: number, positionRaw: string): Promise<LiveReaderEntry | null> {
    const current = await this.get(sessionId);
    if (!current) return null;

    const next: LiveReaderEntry = {
      ...current,
      chapter,
      positionRaw,
    };

    await this.upsert(next);
    return next;
  }

  async heartbeat(sessionId: string): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;

    const key = sessionKey(sessionId);
    const entry = await this.get(sessionId);
    if (!entry) return;

    await redis.multi()
      .expire(key, LIVE_SESSION_TTL_SECONDS)
      .expire(clubKey(entry.clubId), LIVE_SESSION_TTL_SECONDS)
      .exec();
  }
}

export const liveSessionsStore = new LiveSessionsStore();
