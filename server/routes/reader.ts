import express, { Request, Response } from "express";
import { db } from "../db.js";
import {
  books,
  bookContent,
  readingProgress,
  readingHistory,
  bookmarks,
  notes,
  personalBooks,
  clubBooks,
  clubMembers,
  bookReadingStatus,
  analyticsEvents,
  userProfiles,
} from "../../shared/schema.js";
import { eq, and, desc, isNull } from "drizzle-orm";
import { sanitizeBookContent } from "../content-sanitizer.js";
import {
  generateShortLivedToken,
} from "../encryption.js";
import { logger } from "../lib/logger.js";

const router = express.Router();

interface ReaderPositionWithTimestamp {
  timestamp?: number;
}

interface DatabaseErrorLike {
  code?: string;
}

interface StoredReaderSettings {
  fontSize: number;
  fontFamily: string;
  theme: "light" | "dark" | "sepia";
  lineHeight: number;
  textAlign: "left" | "justify";
  contentWidth: number;
}

const DEFAULT_READER_SETTINGS: StoredReaderSettings = {
  fontSize: 18,
  fontFamily: "Georgia",
  theme: "light",
  lineHeight: 1.8,
  textAlign: "justify",
  contentWidth: 80,
};

const ALLOWED_FONT_FAMILIES = new Set([
  "Georgia",
  "Times New Roman",
  "Arial",
  "Verdana",
  "system-ui",
]);

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeReaderSettings(input: unknown): StoredReaderSettings {
  const source = typeof input === "object" && input !== null
    ? input as Partial<StoredReaderSettings>
    : {};

  const theme = source.theme === "dark" || source.theme === "sepia" || source.theme === "light"
    ? source.theme
    : DEFAULT_READER_SETTINGS.theme;

  const textAlign = source.textAlign === "left" || source.textAlign === "justify"
    ? source.textAlign
    : DEFAULT_READER_SETTINGS.textAlign;

  const fontFamily = typeof source.fontFamily === "string" && ALLOWED_FONT_FAMILIES.has(source.fontFamily)
    ? source.fontFamily
    : DEFAULT_READER_SETTINGS.fontFamily;

  return {
    fontSize: Math.round(clampNumber(source.fontSize, 12, 32, DEFAULT_READER_SETTINGS.fontSize)),
    fontFamily,
    theme,
    lineHeight: Math.round(clampNumber(source.lineHeight, 1.2, 2.5, DEFAULT_READER_SETTINGS.lineHeight) * 10) / 10,
    textAlign,
    contentWidth: Math.round(clampNumber(source.contentWidth, 60, 95, DEFAULT_READER_SETTINGS.contentWidth)),
  };
}

function parseStoredReaderSettings(raw: string | null | undefined): StoredReaderSettings {
  if (!raw) {
    return DEFAULT_READER_SETTINGS;
  }

  try {
    return normalizeReaderSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

function extractPositionTimestamp(raw: string | null | undefined): number | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ReaderPositionWithTimestamp;
    if (typeof parsed.timestamp === "number" && Number.isFinite(parsed.timestamp)) {
      return parsed.timestamp;
    }
  } catch {
    return null;
  }

  return null;
}

function isStaleProgressUpdate(existingPosition: string | null, nextPosition: string): boolean {
  const existingTimestamp = extractPositionTimestamp(existingPosition);
  const nextTimestamp = extractPositionTimestamp(nextPosition);

  if (existingTimestamp === null || nextTimestamp === null) {
    return false;
  }

  return nextTimestamp < existingTimestamp;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && (error as DatabaseErrorLike).code === "23505";
}

// Helper functions для уменьшения когнитивной сложности
async function updateBookReadingStatus(userId: string, bookId: string, progress: number, clubId?: string | null) {
  try {
    const bookType = clubId ? 'club' : 'personal';
    const newStatus = progress === 100 ? 'completed' : 'reading';
    const now = new Date();

    await db
      .insert(bookReadingStatus)
      .values({
        userId,
        bookId,
        bookType,
        status: newStatus,
        progress,
        startedAt: now,
        completedAt: progress === 100 ? now : null,
      })
      .onConflictDoUpdate({
        target: [bookReadingStatus.userId, bookReadingStatus.bookId, bookReadingStatus.bookType],
        set: {
          status: newStatus,
          progress,
          completedAt: progress === 100 ? now : undefined,
          updatedAt: now,
        },
      });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error updating book reading status");
  }
}

async function addToReadingHistory(userId: string, bookId: string, clubId?: string | null) {
  try {
    const existingHistory = await db
      .select()
      .from(readingHistory)
      .where(and(
        eq(readingHistory.userId, userId),
        eq(readingHistory.bookId, bookId)
      ))
      .limit(1);

    if (existingHistory.length > 0) {
      return;
    }

    const bookData = await db
      .select({
        title: personalBooks.title,
        author: personalBooks.author,
        coverUrl: personalBooks.coverUrl,
      })
      .from(personalBooks)
      .where(eq(personalBooks.id, bookId))
      .limit(1);

    if (bookData.length === 0) {
      return;
    }

    await db.insert(readingHistory).values({
      userId,
      bookId,
      bookTitle: bookData[0].title,
      bookAuthor: bookData[0].author,
      bookCoverUrl: bookData[0].coverUrl || null,
      completedAt: new Date(),
    });
    
    logger.info(`[Reader API] Книга "${bookData[0].title}" добавлена в историю пользователя ${userId}`);

    try {
      const [analyticsEvent] = await db.insert(analyticsEvents).values({
        eventType: 'book_complete',
        userId,
        bookId,
        progress: 100,
        clubId: clubId || null,
      }).returning();
      logger.info(`[Reader API] Analytics event recorded: ${analyticsEvent.id}`);
    } catch (analyticsError) {
      const errorMessage = analyticsError instanceof Error ? analyticsError.message : String(analyticsError);
      logger.error({ error: errorMessage }, '[Reader API] Error recording analytics event');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error adding to history");
  }
}

router.get("/reader-settings", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [profile] = await db
      .select({
        readerSettings: userProfiles.readerSettings,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    res.json({
      settings: parseStoredReaderSettings(profile?.readerSettings),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error fetching reader settings");
    res.status(500).json({ error: "Failed to fetch reader settings" });
  }
});

router.put("/reader-settings", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const username = req.user?.username;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const settings = normalizeReaderSettings(req.body?.settings ?? req.body);
    const serializedSettings = JSON.stringify(settings);

    await db
      .insert(userProfiles)
      .values({
        userId,
        displayName: username,
        readerSettings: serializedSettings,
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          readerSettings: serializedSettings,
          updatedAt: new Date(),
        },
      });

    res.json({ settings });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error saving reader settings");
    res.status(500).json({ error: "Failed to save reader settings" });
  }
});

router.get("/all-bookmarks", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userBookmarks = await db
      .select({
        id: bookmarks.id,
        userId: bookmarks.userId,
        bookId: bookmarks.bookId,
        chapterNumber: bookmarks.chapterNumber,
        position: bookmarks.position,
        title: bookmarks.title,
        createdAt: bookmarks.createdAt,
        bookTitle: personalBooks.title,
        bookAuthor: personalBooks.author,
        bookCoverUrl: personalBooks.coverUrl,
      })
      .from(bookmarks)
      .leftJoin(personalBooks, eq(bookmarks.bookId, personalBooks.id))
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.createdAt));

    res.json({ bookmarks: userBookmarks });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error fetching all bookmarks");
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
});

/**
 * GET /api/v1/books/:id/content
 * Получение контента книги с санитизацией и дешифровкой
 * Query params: chapter (опционально)
 */
router.get("/:id/content", async (req: Request, res: Response) => {
  try {
    const { id: bookId } = req.params;
    const { chapter } = req.query;
    const userId = req.user?.id; // Из JWT middleware

    if (!userId) {
      logger.warn('[Reader API] No userId in request');
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Проверка доступа к книге
    const hasAccess = await verifyBookAccess(userId, bookId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this book" });
    }

    // Получение книги
    const [book] = await db
      .select()
      .from(books)
      .where(eq(books.id, bookId))
      .limit(1);

    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    // Получение контента по главам
    const chapterNumber = typeof chapter === 'string'
      ? Number.parseInt(chapter, 10)
      : undefined;

    const chapters = await db
      .select()
      .from(bookContent)
      .where(and(
        eq(bookContent.bookId, bookId),
        chapterNumber === undefined ? undefined : eq(bookContent.chapterNumber, chapterNumber)
      ))
      .orderBy(bookContent.chapterNumber);

    if (chapters.length === 0) {
      return res.status(404).json({ error: "Book content not found" });
    }

    // Санитизация контента перед отправкой
    const sanitizedChapters = chapters.map((ch: typeof bookContent.$inferSelect) => ({
      ...ch,
      content: sanitizeBookContent(ch.content),
    }));

    // Генерация short-lived token для клиента (опционально, для будущих запросов)
    const accessToken = generateShortLivedToken(userId, bookId);

    res.json({
      book: {
        id: book.id,
        title: book.title,
        author: book.author,
        totalChapters: book.totalChapters,
      },
      chapters: sanitizedChapters,
      accessToken, // Для последующих запросов
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error fetching book content");
    res.status(500).json({ error: "Failed to fetch book content" });
  }
});

/**
 * PUT /api/v1/books/:id/progress
 * Обновление прогресса чтения (debounced на клиенте)
 */
router.put("/:id/progress", async (req: Request, res: Response) => {
  try {
    const { id: bookId } = req.params;
    const userId = req.user?.id;
    const { currentChapter, currentPosition, progress, clubId } = req.body;
    const normalizedClubId = typeof clubId === 'string' && clubId.length > 0 ? clubId : null;
    const normalizedCurrentChapter = typeof currentChapter === 'number' && currentChapter > 0 ? currentChapter : 1;
    const normalizedCurrentPosition = typeof currentPosition === 'string'
      ? currentPosition
      : JSON.stringify(currentPosition || {});
    const normalizedProgress = typeof progress === 'number' ? progress : 0;

    logger.debug({
      bookId,
      userId,
      currentChapter: normalizedCurrentChapter,
      currentPosition: normalizedCurrentPosition ? 'present' : 'missing',
      progress: normalizedProgress,
      clubId: normalizedClubId
    }, '[Reader API] Progress update request');

    if (!userId) {
      logger.error('[Reader API] No userId in request');
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [existingProgress] = await db
      .select({
        id: readingProgress.id,
        currentPosition: readingProgress.currentPosition,
      })
      .from(readingProgress)
      .where(and(
        eq(readingProgress.userId, userId),
        eq(readingProgress.bookId, bookId),
        normalizedClubId ? eq(readingProgress.clubId, normalizedClubId) : isNull(readingProgress.clubId),
      ))
      .orderBy(desc(readingProgress.updatedAt), desc(readingProgress.lastReadAt))
      .limit(1);

    if (existingProgress) {
      if (isStaleProgressUpdate(existingProgress.currentPosition, normalizedCurrentPosition)) {
        logger.warn({
          bookId,
          userId,
          clubId: normalizedClubId,
        }, "[Reader API] Ignoring stale progress update");
        return res.json({ success: true, ignored: true, reason: "stale_progress_update" });
      }

      await db
        .update(readingProgress)
        .set({
          currentChapter: normalizedCurrentChapter,
          currentPosition: normalizedCurrentPosition,
          progress: normalizedProgress,
          clubId: normalizedClubId,
          lastReadAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(readingProgress.id, existingProgress.id));
    } else {
      try {
        await db
          .insert(readingProgress)
          .values({
            userId,
            bookId,
            clubId: normalizedClubId,
            currentChapter: normalizedCurrentChapter,
            currentPosition: normalizedCurrentPosition,
            progress: normalizedProgress,
            lastReadAt: new Date(),
            updatedAt: new Date(),
          });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }

        const [currentProgress] = await db
          .select({
            id: readingProgress.id,
            currentPosition: readingProgress.currentPosition,
          })
          .from(readingProgress)
          .where(and(
            eq(readingProgress.userId, userId),
            eq(readingProgress.bookId, bookId),
            normalizedClubId ? eq(readingProgress.clubId, normalizedClubId) : isNull(readingProgress.clubId),
          ))
          .orderBy(desc(readingProgress.updatedAt), desc(readingProgress.lastReadAt))
          .limit(1);

        if (currentProgress && !isStaleProgressUpdate(currentProgress.currentPosition, normalizedCurrentPosition)) {
          await db
            .update(readingProgress)
            .set({
              currentChapter: normalizedCurrentChapter,
              currentPosition: normalizedCurrentPosition,
              progress: normalizedProgress,
              clubId: normalizedClubId,
              lastReadAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(readingProgress.id, currentProgress.id));
        }
      }
    }

    await updateBookReadingStatus(userId, bookId, normalizedProgress, normalizedClubId);

    if (normalizedProgress === 100) {
      await addToReadingHistory(userId, bookId, normalizedClubId);
    }

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error updating progress");
    res.status(500).json({ error: "Failed to update progress" });
  }
});

/**
 * GET /api/v1/books/:id/progress
 * Получение прогресса чтения
 */
router.get("/:id/progress", async (req: Request, res: Response) => {
  try {
    const { id: bookId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [progress] = await db
      .select()
      .from(readingProgress)
      .where(
        and(
          eq(readingProgress.userId, userId),
          eq(readingProgress.bookId, bookId)
        )
      )
      .orderBy(desc(readingProgress.updatedAt), desc(readingProgress.lastReadAt))
      .limit(1);

    if (!progress) {
      return res.json({
        currentChapter: 1,
        currentPosition: "0",
        progress: 0,
      });
    }

    res.json(progress);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error fetching progress");
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

/**
 * GET /api/v1/books/:id/bookmarks
 * Получение закладок пользователя для книги
 */
router.get("/:id/bookmarks", async (req: Request, res: Response) => {
  try {
    const { id: bookId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userBookmarks = await db
      .select()
      .from(bookmarks)
      .where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.bookId, bookId))
      )
      .orderBy(desc(bookmarks.createdAt));

    res.json({ bookmarks: userBookmarks });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error fetching bookmarks");
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
});

/**
 * POST /api/v1/books/:id/bookmarks
 * Добавление закладки
 */
router.post("/:id/bookmarks", async (req: Request, res: Response) => {
  try {
    const { id: bookId } = req.params;
    const userId = req.user?.id;
    const { chapterNumber, position, title } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [bookmark] = await db
      .insert(bookmarks)
      .values({
        userId,
        bookId,
        chapterNumber,
        position,
        title,
      })
      .returning();

    res.status(201).json({ bookmark });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error adding bookmark");
    res.status(500).json({ error: "Failed to add bookmark" });
  }
});

/**
 * DELETE /api/v1/books/:id/bookmarks/:bookmarkId
 * Удаление закладки
 */
router.delete("/:id/bookmarks/:bookmarkId", async (req: Request, res: Response) => {
  try {
    const { id: bookId, bookmarkId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await db
      .delete(bookmarks)
      .where(
        and(
          eq(bookmarks.id, bookmarkId),
          eq(bookmarks.userId, userId),
          eq(bookmarks.bookId, bookId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error deleting bookmark");
    res.status(500).json({ error: "Failed to delete bookmark" });
  }
});

/**
 * GET /api/v1/books/:id/notes
 * Получение заметок пользователя для книги
 */
router.get("/:id/notes", async (req: Request, res: Response) => {
  try {
    const { id: bookId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userNotes = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.bookId, bookId)))
      .orderBy(desc(notes.updatedAt));

    res.json({ notes: userNotes });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error fetching notes");
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

/**
 * POST /api/v1/books/:id/notes
 * Добавление заметки
 */
router.post("/:id/notes", async (req: Request, res: Response) => {
  try {
    const { id: bookId } = req.params;
    const userId = req.user?.id;
    const {
      chapterNumber,
      position,
      highlightedText,
      noteText,
      color,
    } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!noteText) {
      return res.status(400).json({ error: "Note text is required" });
    }

    const [note] = await db
      .insert(notes)
      .values({
        userId,
        bookId,
        chapterNumber,
        position,
        highlightedText,
        noteText,
        color: color || "yellow",
      })
      .returning();

    res.status(201).json({ note });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error adding note");
    res.status(500).json({ error: "Failed to add note" });
  }
});

/**
 * PUT /api/v1/books/:id/notes/:noteId
 * Редактирование заметки
 */
router.put("/:id/notes/:noteId", async (req: Request, res: Response) => {
  try {
    const { id: bookId, noteId } = req.params;
    const userId = req.user?.id;
    const { noteText, color } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [note] = await db
      .update(notes)
      .set({
        noteText,
        color,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notes.id, noteId),
          eq(notes.userId, userId),
          eq(notes.bookId, bookId)
        )
      )
      .returning();

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    res.json({ note });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error updating note");
    res.status(500).json({ error: "Failed to update note" });
  }
});

/**
 * DELETE /api/v1/books/:id/notes/:noteId
 * Удаление заметки
 */
router.delete("/:id/notes/:noteId", async (req: Request, res: Response) => {
  try {
    const { id: bookId, noteId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await db
      .delete(notes)
      .where(
        and(
          eq(notes.id, noteId),
          eq(notes.userId, userId),
          eq(notes.bookId, bookId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error deleting note");
    res.status(500).json({ error: "Failed to delete note" });
  }
});

// Вспомогательная функция проверки доступа к книге
async function verifyBookAccess(userId: string, bookId: string): Promise<boolean> {
  try {
    // Проверка персональных книг
    const [personalBook] = await db
      .select()
      .from(personalBooks)
      .where(
        and(
          eq(personalBooks.userId, userId),
          eq(personalBooks.id, bookId)
        )
      )
      .limit(1);

    if (personalBook) return true;

    // Проверка клубных книг
    const [clubBook] = await db
      .select()
      .from(clubBooks)
      .where(eq(clubBooks.id, bookId))
      .limit(1);

    if (clubBook) {
      // Проверка членства в клубе
      const [member] = await db
        .select()
        .from(clubMembers)
        .where(
          and(
            eq(clubMembers.clubId, clubBook.clubId),
            eq(clubMembers.userId, userId),
            eq(clubMembers.isActive, true)
          )
        )
        .limit(1);

      return !!member;
    }

    // Fallback: проверка общей таблицы books
    const [book] = await db
      .select()
      .from(books)
      .where(eq(books.id, bookId))
      .limit(1);

    return !!book;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[Reader API] Error verifying book access");
    return false;
  }
}

export default router;
