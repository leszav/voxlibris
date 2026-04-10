import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { bookReadingStatus } from '../../shared/schema.js';
import { logger } from './logger.js';

type SyncBookReadingStatusParams = {
  userId: string;
  bookId: string;
  bookType: 'personal' | 'club';
  progress: number;
};

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  if (progress < 0) return 0;
  if (progress > 100) return 100;
  return Math.round(progress);
}

export async function syncBookReadingStatus({
  userId,
  bookId,
  bookType,
  progress,
}: SyncBookReadingStatusParams): Promise<void> {
  try {
    const safeProgress = normalizeProgress(progress);
    const status = safeProgress >= 100 ? 'completed' : 'reading';
    const completedAt = safeProgress >= 100 ? new Date() : null;

    const [existingStatus] = await db
      .select()
      .from(bookReadingStatus)
      .where(and(
        eq(bookReadingStatus.userId, userId),
        eq(bookReadingStatus.bookId, bookId),
        eq(bookReadingStatus.bookType, bookType),
      ))
      .limit(1);

    if (existingStatus) {
      const nextCompletedAt = status === 'completed'
        ? (existingStatus.completedAt ?? completedAt)
        : null;

      await db
        .update(bookReadingStatus)
        .set({
          status,
          progress: safeProgress,
          startedAt: existingStatus.startedAt ?? new Date(),
          completedAt: nextCompletedAt,
          updatedAt: new Date(),
        })
        .where(eq(bookReadingStatus.id, existingStatus.id));
      return;
    }

    await db
      .insert(bookReadingStatus)
      .values({
        userId,
        bookId,
        bookType,
        status,
        progress: safeProgress,
        startedAt: new Date(),
        completedAt,
      });
  } catch (error) {
    logger.error({ error }, '[syncBookReadingStatus] Failed to sync reading status');
  }
}
