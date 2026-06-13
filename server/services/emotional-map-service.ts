import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db.js';
import { readingSessions, sessionReactions } from '../../shared/schema.js';

export type DominantEmotion = 'joy' | 'sadness' | 'excitement' | 'tension' | 'neutral';

export interface EmotionalMapReactionBucket {
  emoji: string;
  count: number;
  percentage: number;
}

export interface EmotionalMapPoint {
  timestampMs: number;
  chapterNumber: number | null;
  reactions: EmotionalMapReactionBucket[];
  totalReactions: number;
  chatMessageCount: number;
  dominantEmotion: DominantEmotion;
}

export interface EmotionalMapHighlight {
  timestampMs: number;
  reason: string;
  reactionCount: number;
  dominantEmotion: DominantEmotion;
}

export interface EmotionalMap {
  sessionId: string;
  totalDurationMs: number;
  windowSizeMs: number;
  points: EmotionalMapPoint[];
  highlights: EmotionalMapHighlight[];
  stats: {
    totalReactions: number;
    totalChatMessages: number;
    dominantEmotion: DominantEmotion;
    peakTimestampMs: number | null;
  };
}

const DEFAULT_WINDOW_SIZE_MS = 30_000;
const MAX_WINDOW_SIZE_MS = 10 * 60_000;

const emotionByEmoji = new Map<string, DominantEmotion>([
  ['😂', 'joy'],
  ['🤣', 'joy'],
  ['😄', 'joy'],
  ['😭', 'sadness'],
  ['😢', 'sadness'],
  ['🥺', 'sadness'],
  ['🔥', 'excitement'],
  ['😱', 'excitement'],
  ['🤩', 'excitement'],
  ['😰', 'tension'],
  ['😬', 'tension'],
  ['🫣', 'tension'],
]);

function normalizeWindowSizeMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_WINDOW_SIZE_MS;
  return Math.min(parsed, MAX_WINDOW_SIZE_MS);
}

function getDominantEmotion(reactionCounts: Map<string, number>): DominantEmotion {
  const emotionCounts = new Map<DominantEmotion, number>();

  for (const [emoji, count] of reactionCounts.entries()) {
    const emotion = emotionByEmoji.get(emoji) ?? 'neutral';
    emotionCounts.set(emotion, (emotionCounts.get(emotion) ?? 0) + count);
  }

  let dominant: DominantEmotion = 'neutral';
  let max = 0;
  for (const [emotion, count] of emotionCounts.entries()) {
    if (count > max) {
      dominant = emotion;
      max = count;
    }
  }

  return dominant;
}

function formatHighlightReason(emotion: DominantEmotion): string {
  switch (emotion) {
    case 'joy':
      return 'Пик смеха';
    case 'sadness':
      return 'Самый трогательный момент';
    case 'excitement':
      return 'Пик восторга';
    case 'tension':
      return 'Напряжённый момент';
    case 'neutral':
    default:
      return 'Активный момент';
  }
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function isEmotionalMap(value: unknown, sessionId: string, windowSizeMs: number): value is EmotionalMap {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<EmotionalMap>;
  return candidate.sessionId === sessionId
    && candidate.windowSizeMs === windowSizeMs
    && Array.isArray(candidate.points)
    && Array.isArray(candidate.highlights)
    && typeof candidate.stats === 'object'
    && candidate.stats !== null;
}

export class EmotionalMapService {
  async buildMap(sessionId: string, requestedWindowSizeMs?: unknown): Promise<EmotionalMap | null> {
    const windowSizeMs = normalizeWindowSizeMs(requestedWindowSizeMs);

    const [session] = await db
      .select()
      .from(readingSessions)
      .where(eq(readingSessions.id, sessionId))
      .limit(1);

    if (!session) return null;

    const endedAt = toDate(session.endedAt);
    if (endedAt && windowSizeMs === DEFAULT_WINDOW_SIZE_MS && isEmotionalMap(session.emotionalMapCache, sessionId, windowSizeMs)) {
      return session.emotionalMapCache;
    }

    const reactions = await db
      .select({
        emoji: sessionReactions.emoji,
        audioTimestampMs: sessionReactions.audioTimestampMs,
        chapterNumber: sessionReactions.chapterNumber,
      })
      .from(sessionReactions)
      .where(and(
        eq(sessionReactions.sessionId, sessionId),
        isNotNull(sessionReactions.audioTimestampMs),
      ));

    const maxReactionTimestamp = reactions.reduce((max, reaction) => Math.max(max, reaction.audioTimestampMs ?? 0), 0);
    const startedAt = toDate(session.startedAt);
    const durationFromSession = startedAt && endedAt
      ? Math.max(0, endedAt.getTime() - startedAt.getTime())
      : 0;
    const totalDurationMs = Math.max(durationFromSession, maxReactionTimestamp + windowSizeMs);
    const windowCount = totalDurationMs > 0 ? Math.ceil(totalDurationMs / windowSizeMs) : 0;

    const points: EmotionalMapPoint[] = [];
    for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
      const start = windowIndex * windowSizeMs;
      const end = start + windowSizeMs;
      const windowReactions = reactions.filter((reaction) => {
        const timestamp = reaction.audioTimestampMs ?? -1;
        return timestamp >= start && timestamp < end;
      });

      if (windowReactions.length === 0) continue;

      const reactionCounts = new Map<string, number>();
      let chapterNumber: number | null = null;
      for (const reaction of windowReactions) {
        reactionCounts.set(reaction.emoji, (reactionCounts.get(reaction.emoji) ?? 0) + 1);
        chapterNumber ??= reaction.chapterNumber ?? null;
      }

      const totalReactions = windowReactions.length;
      const reactionsSummary = [...reactionCounts.entries()]
        .map(([emoji, count]) => ({
          emoji,
          count,
          percentage: Math.round((count / totalReactions) * 100),
        }))
        .sort((left, right) => right.count - left.count);

      points.push({
        timestampMs: start,
        chapterNumber,
        reactions: reactionsSummary,
        totalReactions,
        chatMessageCount: 0,
        dominantEmotion: getDominantEmotion(reactionCounts),
      });
    }

    const highlights = points
      .slice()
      .sort((left, right) => right.totalReactions - left.totalReactions)
      .slice(0, 5)
      .map((point) => ({
        timestampMs: point.timestampMs,
        reason: formatHighlightReason(point.dominantEmotion),
        reactionCount: point.totalReactions,
        dominantEmotion: point.dominantEmotion,
      }));

    const allReactionCounts = new Map<string, number>();
    for (const point of points) {
      for (const reaction of point.reactions) {
        allReactionCounts.set(reaction.emoji, (allReactionCounts.get(reaction.emoji) ?? 0) + reaction.count);
      }
    }
    const dominantEmotion = getDominantEmotion(allReactionCounts);

    const map: EmotionalMap = {
      sessionId,
      totalDurationMs,
      windowSizeMs,
      points,
      highlights,
      stats: {
        totalReactions: reactions.length,
        totalChatMessages: 0,
        dominantEmotion,
        peakTimestampMs: highlights[0]?.timestampMs ?? null,
      },
    };

    if (endedAt && windowSizeMs === DEFAULT_WINDOW_SIZE_MS) {
      await db
        .update(readingSessions)
        .set({
          emotionalMapCache: map,
          emotionalMapBuiltAt: new Date(),
        })
        .where(eq(readingSessions.id, sessionId));
    }

    return map;
  }

  async getHighlights(sessionId: string): Promise<EmotionalMapHighlight[] | null> {
    const map = await this.buildMap(sessionId);
    return map?.highlights ?? null;
  }
}

export const emotionalMapService = new EmotionalMapService();
