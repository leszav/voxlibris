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
} from "../../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { sanitizeBookContent } from "../content-sanitizer.js";
import {
  generateShortLivedToken,
} from "../encryption.js";
import { analyticsEvents } from "../../shared/schema.js";

const router = express.Router();

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
      console.log('[Reader API] No userId in request');
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
        chapterNumber !== undefined ? eq(bookContent.chapterNumber, chapterNumber) : undefined
      ))
      .orderBy(bookContent.chapterNumber);

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
    console.error("[Reader API] Error fetching book content:", error);
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

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await db
      .insert(readingProgress)
      .values({
        userId,
        bookId,
        clubId: clubId || null,
        currentChapter: currentChapter || 1,
        currentPosition: currentPosition || "0",
        progress: progress || 0,
        lastReadAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [readingProgress.userId, readingProgress.bookId],
        set: {
          currentChapter,
          currentPosition,
          progress,
          clubId: clubId || null,
          lastReadAt: new Date(),
          updatedAt: new Date(),
        },
      });

    // Если прогресс достиг 100%, добавляем в историю
    if (progress === 100) {
      try {
        // Проверяем, не добавлена ли уже книга в историю
        const existingHistory = await db
          .select()
          .from(readingHistory)
          .where(and(
            eq(readingHistory.userId, userId),
            eq(readingHistory.bookId, bookId)
          ))
          .limit(1);

        if (existingHistory.length === 0) {
          // Получаем данные о книге из personal_books
          const bookData = await db
            .select({
              title: personalBooks.title,
              author: personalBooks.author,
              coverUrl: personalBooks.coverUrl,
            })
            .from(personalBooks)
            .where(eq(personalBooks.id, bookId))
            .limit(1);

          if (bookData.length > 0) {
            // Добавляем в историю
            await db.insert(readingHistory).values({
              userId,
              bookId,
              bookTitle: bookData[0].title,
              bookAuthor: bookData[0].author,
              bookCoverUrl: bookData[0].coverUrl || null,
              completedAt: new Date(),
            });
            console.log(`[Reader API] Книга "${bookData[0].title}" добавлена в историю пользователя ${userId}`);

            // Записываем событие book_complete в аналитику
            try {
              const [analyticsEvent] = await db.insert(analyticsEvents).values({
                eventType: 'book_complete',
                userId,
                bookId,
                progress: 100,
                clubId: clubId || null,
              }).returning();
              console.log(`[Reader API] Analytics event recorded: ${analyticsEvent.id}`);
            } catch (analyticsError) {
              console.error('[Reader API] Error recording analytics event:', analyticsError);
            }
          }
        }
      } catch (historyError) {
        console.error("[Reader API] Error adding to history:", historyError);
        // Не прерываем основной запрос из-за ошибки истории
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[Reader API] Error updating progress:", error);
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
    console.error("[Reader API] Error fetching progress:", error);
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
    console.error("[Reader API] Error fetching bookmarks:", error);
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
    console.error("[Reader API] Error adding bookmark:", error);
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
    console.error("[Reader API] Error deleting bookmark:", error);
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
    console.error("[Reader API] Error fetching notes:", error);
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
    console.error("[Reader API] Error adding note:", error);
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
    console.error("[Reader API] Error updating note:", error);
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
    console.error("[Reader API] Error deleting note:", error);
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
    console.error("[Reader API] Error verifying book access:", error);
    return false;
  }
}

export default router;
