import { Router, type Request, type Response } from "express";
import * as GuestRepo from "./repositories/GuestRepository.js";
import { jwtAuth, requireAdmin } from "./jwt-middleware.js";
import { logger } from "./lib/logger.js";
import { eq, desc, gt, and, sql } from "drizzle-orm";
import { db } from "./db.js";
import { guestAccounts, guestBooks } from "../shared/schema.js";
import { fileStorage } from "./file-storage.js";

const router = Router();

// ============================================
// Middleware: требуем admin права
// ============================================

router.use(jwtAuth);
router.use(requireAdmin);

// ============================================
// Guest books management for Admin Books section
// ============================================

router.get("/guest-books", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit as string) || 50, 100);
    const page = Math.max(Number.parseInt(req.query.page as string) || 1, 1);
    const fallbackOffset = Number.parseInt(req.query.offset as string) || 0;
    const offset = req.query.page ? (page - 1) * limit : fallbackOffset;
    const rawStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    const status = rawStatus && ["pending", "approved", "rejected"].includes(rawStatus)
      ? (rawStatus as "pending" | "approved" | "rejected")
      : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const result = await GuestRepo.listGuestBooksForAdmin({ status, search, limit, offset });
    const totalPages = Math.max(Math.ceil(result.total / limit), 1);

    return res.json({
      books: result.books,
      pagination: {
        page,
        limit,
        offset,
        total: result.total,
        pages: totalPages,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error getting guest books list");
    return res.status(500).json({
      message: "Ошибка при получении гостевых книг",
      code: "ADMIN_GUEST_BOOKS_LIST_ERROR",
    });
  }
});

router.put("/guest-books/:bookId/status", async (req: Request, res: Response) => {
  try {
    const { bookId } = req.params;
    const { status, notes } = req.body as { status?: string; notes?: string };

    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Статус должен быть 'approved' или 'rejected'",
        code: "INVALID_STATUS",
      });
    }

    const book = await GuestRepo.getGuestBookById(bookId);
    if (!book) {
      return res.status(404).json({
        message: "Книга не найдена",
        code: "BOOK_NOT_FOUND",
      });
    }

    await GuestRepo.updateBookModeration(
      bookId,
      status as "approved" | "rejected",
      req.user?.id || "unknown",
      notes,
    );

    logger.info({ bookId, status, moderatorId: req.user?.id }, "Guest book moderation updated");
    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error updating guest book moderation status");
    return res.status(500).json({
      message: "Ошибка при обновлении статуса книги",
      code: "ADMIN_GUEST_BOOK_STATUS_ERROR",
    });
  }
});

router.delete("/guest-books/:bookId", async (req: Request, res: Response) => {
  try {
    const { bookId } = req.params;
    const book = await GuestRepo.getGuestBookById(bookId);

    if (!book) {
      return res.status(404).json({
        message: "Книга не найдена",
        code: "BOOK_NOT_FOUND",
      });
    }

    await GuestRepo.deleteGuestBook(bookId);
    logger.info({ bookId, adminId: req.user?.id }, "Guest book deleted by admin");

    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error deleting guest book by admin");
    return res.status(500).json({
      message: "Ошибка при удалении гостевой книги",
      code: "ADMIN_GUEST_BOOK_DELETE_ERROR",
    });
  }
});

router.get("/guest-books/:bookId/download", async (req: Request, res: Response) => {
  try {
    const { bookId } = req.params;
    const book = await GuestRepo.getGuestBookById(bookId);

    if (!book) {
      return res.status(404).json({
        message: "Книга не найдена",
        code: "BOOK_NOT_FOUND",
      });
    }

    if (!book.originalFileStorageKey) {
      return res.status(404).json({
        message: "Оригинальный файл для этой книги недоступен",
        code: "ORIGINAL_FILE_NOT_FOUND",
      });
    }

    const fileBuffer = await fileStorage.getFile(book.originalFileStorageKey);
    const safeFilename = (book.originalFilename || `${book.title}.${book.format}`)
      .replaceAll(/[\\/:*?"<>|]+/g, "_")
      .trim();
    const downloadFilename = safeFilename || "guest-book" + "." + book.format;
    const contentType =
      book.originalFileContentType ||
      (book.format === "epub" ? "application/epub+zip" : "application/xml");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`);
    return res.send(fileBuffer);
  } catch (error) {
    logger.error({ error }, "Error downloading guest book for moderation");
    return res.status(500).json({
      message: "Ошибка при открытии гостевой книги",
      code: "ADMIN_GUEST_BOOK_DOWNLOAD_ERROR",
    });
  }
});

// ============================================
// 3.1 Получить список гостей
// GET /api/v1/admin/guests
// ============================================

router.get("/guests", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit as string) || 50, 100);
    const offset = Number.parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;
    const search = req.query.search as string;

    // Применяем фильтры
    const conditions = [];
    if (status) {
      conditions.push(eq(guestAccounts.status, status as "active" | "expired" | "deleted"));
    }
    if (search) {
      conditions.push(eq(guestAccounts.accessCode, search.toUpperCase()));
    }

    const guests = await db
      .select()
      .from(guestAccounts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(guestAccounts.lastSeenAt))
      .limit(limit)
      .offset(offset);

    // Получаем количество книг для каждого гостя
    const guestsWithBooks = await Promise.all(
      guests.map(async (guest) => {
        const [bookCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(guestBooks)
          .where(eq(guestBooks.guestAccountId, guest.id));

        return {
          ...guest,
          bookCount: Number(bookCount?.count || 0),
        };
      })
    );

    return res.json({
      guests: guestsWithBooks,
      limit,
      offset,
    });
  } catch (error) {
    logger.error({ error }, "Error getting guests list");
    return res.status(500).json({
      message: "Ошибка при получении списка гостей",
      code: "ADMIN_GUESTS_ERROR",
    });
  }
});

// ============================================
// 3.2 Получить гостя по ID
// GET /api/v1/admin/guests/:id
// ============================================

router.get("/guests/:id", async (req: Request, res: Response) => {
  try {
    const guestId = req.params.id;
    const guest = await GuestRepo.getGuestById(guestId);

    if (!guest) {
      return res.status(404).json({
        message: "Гость не найден",
        code: "GUEST_NOT_FOUND",
      });
    }

    // Получаем статистику
    const summary = await GuestRepo.getGuestAnalyticsSummary(guestId);

    return res.json({
      id: guest.id,
      accessCode: guest.accessCode,
      createdAt: guest.createdAt.toISOString(),
      lastSeenAt: guest.lastSeenAt.toISOString(),
      expiresAt: guest.expiresAt.toISOString(),
      status: guest.status,
      recoveryAttempts: guest.recoveryAttempts,
      analytics: summary,
    });
  } catch (error) {
    logger.error({ error }, "Error getting guest");
    return res.status(500).json({
      message: "Ошибка при получении гостя",
      code: "ADMIN_GUEST_ERROR",
    });
  }
});

// ============================================
// 3.3 Получить книги гостя
// GET /api/v1/admin/guests/:id/books
// ============================================

router.get("/guests/:id/books", async (req: Request, res: Response) => {
  try {
    const guestId = req.params.id;
    const includeDeleted = req.query.includeDeleted === "true";

    const books = await db
      .select()
      .from(guestBooks)
      .where(
        includeDeleted
          ? eq(guestBooks.guestAccountId, guestId)
          : and(
              eq(guestBooks.guestAccountId, guestId),
              eq(guestBooks.isDeleted, false)
            )
      )
      .orderBy(desc(guestBooks.uploadedAt));

    return res.json({ books });
  } catch (error) {
    logger.error({ error }, "Error getting guest books");
    return res.status(500).json({
      message: "Ошибка при получении книг",
      code: "ADMIN_GUEST_BOOKS_ERROR",
    });
  }
});

// ============================================
// 3.4 Модерация книги
// POST /api/v1/admin/guests/:guestId/books/:bookId/moderate
// ============================================

router.post("/guests/:guestId/books/:bookId/moderate", async (req: Request, res: Response) => {
  try {
    const { guestId, bookId } = req.params;
    const { status, notes } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Статус должен быть 'approved' или 'rejected'",
        code: "INVALID_STATUS",
      });
    }

    const book = await GuestRepo.getGuestBookById(bookId);
    if (!book) {
      return res.status(404).json({
        message: "Книга не найдена",
        code: "BOOK_NOT_FOUND",
      });
    }

    if (book.guestAccountId !== guestId) {
      return res.status(400).json({
        message: "Книга не принадлежит этому гостю",
        code: "BOOK_MISMATCH",
      });
    }

    await GuestRepo.updateBookModeration(
      bookId,
      status,
      req.user?.id || "unknown",
      notes
    );

    logger.info({ bookId, status, moderatorId: req.user?.id }, "Book moderated");

    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error moderating book");
    return res.status(500).json({
      message: "Ошибка при модерации",
      code: "ADMIN_MODERATE_ERROR",
    });
  }
});

// ============================================
// 3.5 Скачать книгу (для админа)
// GET /api/v1/admin/guests/:guestId/books/:bookId/download
// ============================================

router.get("/guests/:guestId/books/:bookId/download", async (req: Request, res: Response) => {
  try {
    const { bookId } = req.params;

    const book = await GuestRepo.getGuestBookById(bookId);
    if (!book) {
      return res.status(404).json({
        message: "Книга не найдена",
        code: "BOOK_NOT_FOUND",
      });
    }

    // Возвращаем как JSON для скачивания
    return res.json({
      title: book.title,
      author: book.author,
      format: book.format,
      content: book.flatContent,
    });
  } catch (error) {
    logger.error({ error }, "Error downloading book");
    return res.status(500).json({
      message: "Ошибка при скачивании",
      code: "ADMIN_DOWNLOAD_ERROR",
    });
  }
});

// ============================================
// 3.6 Удалить гостя
// DELETE /api/v1/admin/guests/:id
// ============================================

router.delete("/guests/:id", async (req: Request, res: Response) => {
  try {
    const guestId = req.params.id;
    const guest = await GuestRepo.getGuestById(guestId);

    if (!guest) {
      return res.status(404).json({
        message: "Гость не найден",
        code: "GUEST_NOT_FOUND",
      });
    }

    await GuestRepo.markGuestAsDeleted(guestId);

    logger.info({ guestId, adminId: req.user?.id }, "Guest deleted by admin");

    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error deleting guest");
    return res.status(500).json({
      message: "Ошибка при удалении",
      code: "ADMIN_DELETE_ERROR",
    });
  }
});

// ============================================
// 3.7 Статистика платформы (guests)
// GET /api/v1/admin/guests/stats
// ============================================

router.get("/guests/stats", async (req: Request, res: Response) => {
  try {
    // Активные гости (active status, не истекшие)
    const [activeCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(guestAccounts)
      .where(
        and(
          eq(guestAccounts.status, "active"),
          gt(guestAccounts.expiresAt, new Date())
        )
      );

    // Гости за сегодня
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(guestAccounts)
      .where(gt(guestAccounts.createdAt, today));

    // Гости за неделю
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const [weekCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(guestAccounts)
      .where(gt(guestAccounts.createdAt, weekAgo));

    // Гости за месяц
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const [monthCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(guestAccounts)
      .where(gt(guestAccounts.createdAt, monthAgo));

    // Всего книг
    const [totalBooks] = await db
      .select({ count: sql<number>`count(*)` })
      .from(guestBooks)
      .where(eq(guestBooks.isDeleted, false));

    // Книги на модерации
    const [pendingModeration] = await db
      .select({ count: sql<number>`count(*)` })
      .from(guestBooks)
      .where(
        and(
          eq(guestBooks.moderationStatus, "pending"),
          eq(guestBooks.isDeleted, false)
        )
      );

    // Просроченные книги
    const now = new Date();
    const [expiredBooks] = await db
      .select({ count: sql<number>`count(*)` })
      .from(guestBooks)
      .where(sql`${guestBooks.expiresAt} < ${now}`);

    return res.json({
      activeGuests: Number(activeCount?.count || 0),
      createdToday: Number(todayCount?.count || 0),
      createdThisWeek: Number(weekCount?.count || 0),
      createdThisMonth: Number(monthCount?.count || 0),
      totalBooks: Number(totalBooks?.count || 0),
      pendingModeration: Number(pendingModeration?.count || 0),
      expiredBooks: Number(expiredBooks?.count || 0),
    });
  } catch (error) {
    logger.error({ error }, "Error getting guest stats");
    return res.status(500).json({
      message: "Ошибка при получении статистики",
      code: "ADMIN_STATS_ERROR",
    });
  }
});

// ============================================
// 3.8 Книги на модерацию
// GET /api/v1/admin/guests/moderation/queue
// ============================================

router.get("/guests/moderation/queue", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit as string) || 50, 100);
    const offset = Number.parseInt(req.query.offset as string) || 0;

    const books = await GuestRepo.getBooksForModeration(limit, offset);

    // Добавляем информацию о госте
    const booksWithGuest = await Promise.all(
      books.map(async (book) => {
        const guest = await GuestRepo.getGuestById(book.guestAccountId);
        return {
          ...book,
          guestAccessCode: guest?.accessCode,
        };
      })
    );

    return res.json({
      books: booksWithGuest,
      limit,
      offset,
    });
  } catch (error) {
    logger.error({ error }, "Error getting moderation queue");
    return res.status(500).json({
      message: "Ошибка при получении очереди модерации",
      code: "ADMIN_MODERATION_QUEUE_ERROR",
    });
  }
});

export default router;
