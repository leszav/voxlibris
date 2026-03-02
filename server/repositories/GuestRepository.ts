import { eq, and, or, lt, gt, desc, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  guestAccounts,
  guestBooks,
  guestReadingPositions,
  guestAnalytics,
  type GuestAccount,
  type GuestBook,
  type GuestReadingPosition,
  type InsertGuestReadingPosition,
  type GuestAnalytics,
  GuestAccountStatus,
  GuestBookModerationStatus,
  GuestAnalyticsEventType,
} from "../../shared/schema.js";
import { logger } from "../lib/logger.js";

// ============================================
// GUEST ACCOUNTS
// ============================================

export async function createGuest(data: {
  accessCode: string;
  expiresAt: Date;
  browserFingerprint?: string;
  ip?: string;
  userAgent?: string;
}): Promise<GuestAccount> {
  const [guest] = await db
    .insert(guestAccounts)
    .values({
      accessCode: data.accessCode,
      expiresAt: data.expiresAt,
      browserFingerprint: data.browserFingerprint,
      createdFromIp: data.ip,
      createdUserAgent: data.userAgent,
      status: "active" as GuestAccountStatus,
    })
    .returning();

  logger.info({ guestId: guest.id, accessCode: data.accessCode }, "Guest account created");
  return guest;
}

export async function getGuestById(id: string): Promise<GuestAccount | null> {
  const [guest] = await db
    .select()
    .from(guestAccounts)
    .where(eq(guestAccounts.id, id))
    .limit(1);

  return guest || null;
}

export async function getGuestByCode(code: string): Promise<GuestAccount | null> {
  const [guest] = await db
    .select()
    .from(guestAccounts)
    .where(and(
      eq(guestAccounts.accessCode, code),
      eq(guestAccounts.status, "active")
    ))
    .limit(1);

  return guest || null;
}

export async function getGuestByFingerprint(fingerprint: string): Promise<GuestAccount | null> {
  const [guest] = await db
    .select()
    .from(guestAccounts)
    .where(and(
      eq(guestAccounts.browserFingerprint, fingerprint),
      eq(guestAccounts.status, "active"),
      gt(guestAccounts.expiresAt, new Date())
    ))
    .orderBy(desc(guestAccounts.lastSeenAt))
    .limit(1);

  return guest || null;
}

export async function updateLastSeen(guestId: string): Promise<void> {
  await db
    .update(guestAccounts)
    .set({ lastSeenAt: new Date() })
    .where(eq(guestAccounts.id, guestId));
}

export async function extendGuestExpiry(guestId: string, daysToAdd: number = 30): Promise<void> {
  const newExpiry = new Date();
  newExpiry.setDate(newExpiry.getDate() + daysToAdd);

  await db
    .update(guestAccounts)
    .set({ expiresAt: newExpiry })
    .where(eq(guestAccounts.id, guestId));
}

export async function markGuestAsDeleted(guestId: string): Promise<void> {
  await db
    .update(guestAccounts)
    .set({ status: "deleted" as GuestAccountStatus })
    .where(eq(guestAccounts.id, guestId));
}

export async function incrementRecoveryAttempts(guestId: string): Promise<void> {
  await db
    .update(guestAccounts)
    .set({
      recoveryAttempts: sql`${guestAccounts.recoveryAttempts} + 1`,
      lastRecoveryAt: new Date(),
    })
    .where(eq(guestAccounts.id, guestId));
}

export async function isGuestExpired(guestId: string): Promise<boolean> {
  const guest = await getGuestById(guestId);
  if (!guest) return true;
  return guest.expiresAt < new Date();
}

// ============================================
// GUEST BOOKS
// ============================================

export async function createGuestBook(data: {
  guestAccountId: string;
  title: string;
  author: string;
  format: string;
  fileSizeBytes: number;
  flatContent: string;
  contentHash?: string;
  wordCount?: number;
  originalFilename?: string;
  originalFileStorageKey?: string;
  originalFileContentType?: string;
}): Promise<GuestBook> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const [book] = await db
    .insert(guestBooks)
    .values({
      guestAccountId: data.guestAccountId,
      title: data.title,
      author: data.author,
      format: data.format as GuestBook["format"],
      fileSizeBytes: data.fileSizeBytes,
      flatContent: data.flatContent,
      contentHash: data.contentHash,
      wordCount: data.wordCount || 0,
      originalFilename: data.originalFilename,
      originalFileStorageKey: data.originalFileStorageKey,
      originalFileContentType: data.originalFileContentType,
      expiresAt,
      moderationStatus: "pending" as GuestBookModerationStatus,
    })
    .returning();

  logger.info({ bookId: book.id, guestId: data.guestAccountId }, "Guest book uploaded");
  return book;
}

export async function getActiveGuestBook(guestAccountId: string): Promise<GuestBook | null> {
  const [book] = await db
    .select()
    .from(guestBooks)
    .where(and(
      eq(guestBooks.guestAccountId, guestAccountId),
      eq(guestBooks.isDeleted, false),
      gt(guestBooks.expiresAt, new Date())
    ))
    .limit(1);

  return book || null;
}

export async function getGuestBookById(bookId: string): Promise<GuestBook | null> {
  const [book] = await db
    .select()
    .from(guestBooks)
    .where(eq(guestBooks.id, bookId))
    .limit(1);

  return book || null;
}

export async function deleteGuestBook(bookId: string): Promise<void> {
  await db
    .update(guestBooks)
    .set({
      isDeleted: true,
      deletedAt: new Date(),
    })
    .where(eq(guestBooks.id, bookId));

  logger.info({ bookId }, "Guest book deleted");
}

export async function replaceGuestBook(guestAccountId: string, newBookData: Parameters<typeof createGuestBook>[0]): Promise<GuestBook> {
  // Delete existing book
  const existingBook = await getActiveGuestBook(guestAccountId);
  if (existingBook) {
    await deleteGuestBook(existingBook.id);
  }

  // Create new book
  return createGuestBook(newBookData);
}

export async function getBooksForModeration(limit: number = 50, offset: number = 0): Promise<GuestBook[]> {
  return db
    .select()
    .from(guestBooks)
    .where(eq(guestBooks.moderationStatus, "pending" as GuestBookModerationStatus))
    .orderBy(desc(guestBooks.uploadedAt))
    .limit(limit)
    .offset(offset);
}

function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

export async function findSimilarBlockedGuestBook(data: {
  title: string;
  author: string;
  contentHash?: string;
}): Promise<{ id: string; title: string; author: string; reason: string } | null> {
  const normalizedTitle = normalizeForComparison(data.title);
  const normalizedAuthor = normalizeForComparison(data.author);

  const similarityConditions = [
    and(
      sql`lower(${guestBooks.title}) = ${normalizedTitle}`,
      sql`lower(${guestBooks.author}) = ${normalizedAuthor}`,
    ),
  ];

  if (data.contentHash) {
    similarityConditions.push(eq(guestBooks.contentHash, data.contentHash));
  }

  const [blockedBook] = await db
    .select({
      id: guestBooks.id,
      title: guestBooks.title,
      author: guestBooks.author,
      moderationNotes: guestBooks.moderationNotes,
    })
    .from(guestBooks)
    .where(
      and(
        eq(guestBooks.isDeleted, false),
        eq(guestBooks.moderationStatus, "rejected"),
        or(...similarityConditions),
      ),
    )
    .orderBy(desc(guestBooks.moderatedAt), desc(guestBooks.uploadedAt))
    .limit(1);

  if (!blockedBook) {
    return null;
  }

  return {
    id: blockedBook.id,
    title: blockedBook.title,
    author: blockedBook.author,
    reason: blockedBook.moderationNotes || "похожий контент ранее заблокирован модератором",
  };
}

export async function listGuestBooksForAdmin(params?: {
  status?: "pending" | "approved" | "rejected";
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ books: Array<GuestBook & { guestAccessCode: string; guestExpiresAt: Date }>; total: number }> {
  const limit = Math.min(Math.max(params?.limit || 50, 1), 100);
  const offset = Math.max(params?.offset || 0, 0);

  const conditions = [eq(guestBooks.isDeleted, false)];

  if (params?.status) {
    conditions.push(eq(guestBooks.moderationStatus, params.status));
  }

  if (params?.search?.trim()) {
    const normalizedSearch = `%${params.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(
        lower(${guestBooks.title}) LIKE ${normalizedSearch}
        OR lower(${guestBooks.author}) LIKE ${normalizedSearch}
        OR lower(${guestAccounts.accessCode}) LIKE ${normalizedSearch}
      )`,
    );
  }

  const rows = await db
    .select({
      book: guestBooks,
      guestAccessCode: guestAccounts.accessCode,
      guestExpiresAt: guestAccounts.expiresAt,
    })
    .from(guestBooks)
    .innerJoin(guestAccounts, eq(guestBooks.guestAccountId, guestAccounts.id))
    .where(and(...conditions))
    .orderBy(desc(guestBooks.uploadedAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(guestBooks)
    .innerJoin(guestAccounts, eq(guestBooks.guestAccountId, guestAccounts.id))
    .where(and(...conditions));

  return {
    books: rows.map((row) => ({
      ...row.book,
      guestAccessCode: row.guestAccessCode,
      guestExpiresAt: row.guestExpiresAt,
    })),
    total: Number(count || 0),
  };
}

export async function updateBookModeration(
  bookId: string,
  status: GuestBookModerationStatus,
  moderatorId: string,
  notes?: string
): Promise<void> {
  await db
    .update(guestBooks)
    .set({
      moderationStatus: status,
      moderatedBy: moderatorId,
      moderatedAt: new Date(),
      moderationNotes: notes,
    })
    .where(eq(guestBooks.id, bookId));

  logger.info({ bookId, status, moderatorId }, "Book moderation updated");
}

// ============================================
// GUEST READING POSITIONS
// ============================================

export async function upsertGuestReadingPosition(data: {
  guestAccountId: string;
  guestBookId: string;
  progressPercent: number;
  currentPosition?: Record<string, unknown>;
  readingTimeMinutes?: number;
}): Promise<GuestReadingPosition> {
  const existing = await db
    .select()
    .from(guestReadingPositions)
    .where(and(
      eq(guestReadingPositions.guestAccountId, data.guestAccountId),
      eq(guestReadingPositions.guestBookId, data.guestBookId)
    ))
    .limit(1);

  if (existing[0]) {
    const currentMinutes = existing[0].readingTimeMinutes || 0;
    const addedMinutes = data.readingTimeMinutes || 0;
    
    const [updated] = await db
      .update(guestReadingPositions)
      .set({
        progressPercent: data.progressPercent,
        currentPosition: data.currentPosition || existing[0].currentPosition,
        readingTimeMinutes: currentMinutes + addedMinutes,
        lastReadAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(guestReadingPositions.id, existing[0].id))
      .returning();

    return updated;
  }

  const [position] = await db
    .insert(guestReadingPositions)
    .values({
      guestAccountId: data.guestAccountId,
      guestBookId: data.guestBookId,
      progressPercent: data.progressPercent,
      currentPosition: data.currentPosition || {},
      readingTimeMinutes: data.readingTimeMinutes || 0,
    } as InsertGuestReadingPosition)
    .returning();

  return position;
}

export async function getGuestReadingPosition(guestAccountId: string, guestBookId: string): Promise<GuestReadingPosition | null> {
  const [position] = await db
    .select()
    .from(guestReadingPositions)
    .where(and(
      eq(guestReadingPositions.guestAccountId, guestAccountId),
      eq(guestReadingPositions.guestBookId, guestBookId)
    ))
    .limit(1);

  return position || null;
}

export async function getAllGuestReadingPositions(guestAccountId: string): Promise<GuestReadingPosition[]> {
  return db
    .select()
    .from(guestReadingPositions)
    .where(eq(guestReadingPositions.guestAccountId, guestAccountId));
}

// ============================================
// GUEST ANALYTICS (simplified - batch)
// ============================================

export async function trackGuestEvent(data: {
  guestAccountId: string;
  guestBookId?: string;
  eventType: GuestAnalyticsEventType;
  eventData?: Record<string, unknown>;
  sessionId?: string;
}): Promise<GuestAnalytics> {
  const [event] = await db
    .insert(guestAnalytics)
    .values({
      guestAccountId: data.guestAccountId,
      guestBookId: data.guestBookId,
      eventType: data.eventType,
      eventData: data.eventData || {},
      sessionId: data.sessionId,
    })
    .returning();

  return event;
}

export async function getGuestEvents(
  guestAccountId: string,
  eventType?: GuestAnalyticsEventType,
  limit: number = 100
) {
  const conditions = [eq(guestAnalytics.guestAccountId, guestAccountId)];
  if (eventType) {
    conditions.push(eq(guestAnalytics.eventType, eventType));
  }

  return db
    .select()
    .from(guestAnalytics)
    .where(and(...conditions))
    .orderBy(desc(guestAnalytics.createdAt))
    .limit(limit);
}

export async function getGuestAnalyticsSummary(guestAccountId: string): Promise<{
  totalReadingTime: number;
  sessionsCount: number;
  lastActivity: string | null;
}> {
  const events = await db
    .select({
      eventType: guestAnalytics.eventType,
      eventData: guestAnalytics.eventData,
      createdAt: guestAnalytics.createdAt,
    })
    .from(guestAnalytics)
    .where(eq(guestAnalytics.guestAccountId, guestAccountId))
    .orderBy(desc(guestAnalytics.createdAt));

  // Calculate total reading time from session_end events
  let totalReadingTime = 0;
  const sessionEndEvents = events.filter(e => e.eventType === "session_end");
  sessionEndEvents.forEach(event => {
    const data = event.eventData as { readingTimeMinutes?: number };
    if (data?.readingTimeMinutes) {
      totalReadingTime += data.readingTimeMinutes;
    }
  });

  return {
    totalReadingTime,
    sessionsCount: sessionEndEvents.length,
    lastActivity: events[0]?.createdAt?.toISOString() || null,
  };
}

// ============================================
// CLEANUP (for scheduler)
// ============================================

export async function cleanupExpiredGuestBooks(): Promise<number> {
  const result = await db
    .delete(guestBooks)
    .where(lt(guestBooks.expiresAt, new Date()))
    .returning({ id: guestBooks.id });

  logger.info({ deletedCount: result.length }, "Cleaned up expired guest books");
  return result.length;
}

export async function cleanupExpiredGuestAccounts(): Promise<number> {
  // Delete accounts that have expired AND have no active books
  const result = await db
    .delete(guestAccounts)
    .where(and(
      lt(guestAccounts.expiresAt, new Date()),
      eq(guestAccounts.status, "active")
    ))
    .returning({ id: guestAccounts.id });

  logger.info({ deletedCount: result.length }, "Cleaned up expired guest accounts");
  return result.length;
}

export async function cleanupOldAnalytics(daysOld: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await db
    .delete(guestAnalytics)
    .where(lt(guestAnalytics.createdAt, cutoffDate))
    .returning({ id: guestAnalytics.id });

  logger.info({ deletedCount: result.length }, "Cleaned up old guest analytics");
  return result.length;
}
