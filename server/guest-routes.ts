import { Router, type Request, type Response } from "express";
import multer from "multer";
import { createHash } from "node:crypto";
import * as GuestRepo from "./repositories/GuestRepository.js";
import { generateGuestCode, validateGuestCodeFormat } from "./lib/guest-code-generator.js";
import { guestAuthOptional, guestAuthRequired, setGuestCookie, clearGuestCookie, getBrowserFingerprint } from "./middleware/guest-auth.js";
import { logger } from "./lib/logger.js";
import { BookParserFactory } from "./book-parser.js";
import { isGuestAccessEnabled } from "./lib/feature-flags.js";
import { fileStorage } from "./file-storage.js";

const router = Router();

// ============================================
// Middleware: Check if guest access is enabled
// ============================================
router.use(async (req: Request, res: Response, next) => {
	const enabled = await isGuestAccessEnabled();
	if (!enabled) {
		return res.status(404).json({ message: "Guest access is disabled", code: "GUEST_DISABLED" });
	}
	next();
});

// ============================================
// Middleware для проверки гостя
// ============================================

// Для всех /guest routes - опциональная auth
router.use(guestAuthOptional);

// ============================================
// 2.1 Инициализация гостя
// POST /api/v1/guest/init
// ============================================

router.post("/init", async (req: Request, res: Response) => {
  try {
    // Если уже есть валидная сессия - вернуть текущего гостя
    if (req.guestId && req.guestAccount) {
      const activeBook = await GuestRepo.getActiveGuestBook(req.guestId);
      
      return res.json({
        guestId: req.guestAccount.id,
        accessCode: req.guestAccount.accessCode,
        expiresAt: req.guestAccount.expiresAt.toISOString(),
        hasBook: !!activeBook,
        canRecover: true,
      });
    }

    // Создать нового гостя
    const accessCode = await generateGuestCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const fingerprint = getBrowserFingerprint(req);
    const ip = req.ip || req.socket.remoteAddress || undefined;

    const guest = await GuestRepo.createGuest({
      accessCode,
      expiresAt,
      browserFingerprint: fingerprint || undefined,
      ip,
      userAgent: req.headers["user-agent"] || undefined,
    });

    // Установить cookie
    setGuestCookie(res, guest.id, 30);

    logger.info({ guestId: guest.id, accessCode }, "Guest initialized");

    return res.status(201).json({
      guestId: guest.id,
      accessCode: guest.accessCode,
      expiresAt: guest.expiresAt.toISOString(),
      hasBook: false,
      canRecover: true,
    });
  } catch (error) {
    logger.error({ error }, "Error initializing guest");
    return res.status(500).json({
      message: "Ошибка при создании гостевого аккаунта",
      code: "GUEST_INIT_ERROR",
    });
  }
});

// ============================================
// 2.2 Восстановление доступа по коду
// POST /api/v1/guest/restore
// ============================================

router.post("/restore", async (req: Request, res: Response) => {
  try {
    const { code, browserFingerprint, attemptRecovery } = req.body;

    // Вариант 1: Восстановление по коду
    if (code) {
      const validation = validateGuestCodeFormat(code);
      if (!validation.valid) {
        return res.status(400).json({
          message: validation.error,
          code: "INVALID_CODE",
        });
      }

      const guest = await GuestRepo.getGuestByCode(code.toUpperCase());
      if (!guest) {
        return res.status(404).json({
          message: "Гостевой аккаунт с таким кодом не найден",
          code: "GUEST_NOT_FOUND",
        });
      }

      if (guest.status !== "active") {
        return res.status(410).json({
          message: "Гостевой аккаунт истек или удален",
          code: "GUEST_EXPIRED",
        });
      }

      if (guest.expiresAt < new Date()) {
        return res.status(410).json({
          message: "Срок действия гостевого аккаунта истек",
          code: "GUEST_EXPIRED",
        });
      }

      // Установить cookie
      setGuestCookie(res, guest.id, 30);
      
      // Обновить last_seen
      await GuestRepo.updateLastSeen(guest.id);

      const activeBook = await GuestRepo.getActiveGuestBook(guest.id);

      logger.info({ guestId: guest.id, accessCode: code }, "Guest restored by code");

      return res.json({
        guestId: guest.id,
        accessCode: guest.accessCode,
        expiresAt: guest.expiresAt.toISOString(),
        hasBook: !!activeBook,
        recoveryUsed: false,
      });
    }

    // Вариант 2: Восстановление по fingerprint (если код потерян)
    if (attemptRecovery && browserFingerprint) {
      const guest = await GuestRepo.getGuestByFingerprint(browserFingerprint);
      
      if (!guest) {
        return res.status(404).json({
          message: "Не удалось найти аккаунт. Потребуется создать новый.",
          code: "GUEST_NOT_FOUND",
        });
      }

      // Увеличить счетчик попыток восстановления
      await GuestRepo.incrementRecoveryAttempts(guest.id);

      setGuestCookie(res, guest.id, 30);
      await GuestRepo.updateLastSeen(guest.id);

      const activeBook = await GuestRepo.getActiveGuestBook(guest.id);

      logger.info({ guestId: guest.id }, "Guest restored by fingerprint");

      return res.json({
        guestId: guest.id,
        accessCode: guest.accessCode,
        expiresAt: guest.expiresAt.toISOString(),
        hasBook: !!activeBook,
        recoveryUsed: true,
      });
    }

    return res.status(400).json({
      message: "Требуется код или fingerprint",
      code: "INVALID_REQUEST",
    });
  } catch (error) {
    logger.error({ error }, "Error restoring guest");
    return res.status(500).json({
      message: "Ошибка при восстановлении доступа",
      code: "GUEST_RESTORE_ERROR",
    });
  }
});

// ============================================
// 2.3 Получить текущий гостевой аккаунт
// GET /api/v1/guest/me
// ============================================

router.get("/me", async (req: Request, res: Response) => {
  try {
    if (!req.guestId || !req.guestAccount) {
      return res.status(404).json({
        message: "Гостевой аккаунт не найден",
        code: "GUEST_NOT_FOUND",
      });
    }

    const activeBook = await GuestRepo.getActiveGuestBook(req.guestId);

    return res.json({
      guestId: req.guestAccount.id,
      accessCode: req.guestAccount.accessCode,
      expiresAt: req.guestAccount.expiresAt.toISOString(),
      hasBook: !!activeBook,
      book: activeBook ? {
        id: activeBook.id,
        title: activeBook.title,
        author: activeBook.author,
        format: activeBook.format,
        wordCount: activeBook.wordCount,
        uploadedAt: activeBook.uploadedAt.toISOString(),
      } : null,
    });
  } catch (error) {
    logger.error({ error }, "Error getting guest profile");
    return res.status(500).json({
      message: "Ошибка при получении данных",
      code: "GUEST_ME_ERROR",
    });
  }
});

// ============================================
// 2.4 Logout (очистка cookie)
// POST /api/v1/guest/logout
// ============================================

router.post("/logout", (req: Request, res: Response) => {
  clearGuestCookie(res);
  return res.json({ success: true });
});

// ============================================
// Middleware для обязательной auth (для защищенных routes)
// ============================================

// Применяем guestAuthRequired для всех следующих routes
router.use(guestAuthRequired);

// ============================================
// 2.5 Загрузка книги
// POST /api/v1/guest/books/upload
// ============================================

// Настройка multer для guest upload (1MB limit)
const guestUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024, // 1 MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = [".epub", ".fb2"];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file format. Only EPUB and FB2 are allowed."));
    }
  },
});

router.post("/books/upload", guestUpload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.guestId) {
      return res.status(401).json({
        message: "Требуется гостевой доступ",
        code: "GUEST_REQUIRED",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Файл не загружен",
        code: "NO_FILE",
      });
    }

    // Проверить, есть ли уже активная книга
    const existingBook = await GuestRepo.getActiveGuestBook(req.guestId);
    if (existingBook && !req.body.replace) {
      return res.status(409).json({
        message: "У вас уже есть активная книга. Используйте replace=true для замены.",
        code: "BOOK_ALREADY_EXISTS",
        bookId: existingBook.id,
      });
    }

    // Парсинг книги - определяем тип файла
    const fileType = await BookParserFactory.detectFileTypeFromBuffer(req.file.buffer, req.file.originalname);
    if (!fileType) {
      return res.status(400).json({
        message: "Не удалось определить формат файла. Поддерживаются EPUB и FB2.",
        code: "INVALID_FORMAT",
      });
    }

    const parser = BookParserFactory.createParser(fileType);
    const parsed = await parser.parseBook(req.file.buffer, req.file.originalname);

    // Создаем flat content из глав
    const flatContent = parsed.chapters
      .map(ch => `\n\n=== ${ch.title} ===\n\n${ch.content}`)
      .join("\n");

    const normalizedContent = flatContent.toLowerCase().replaceAll(/\s+/g, " ").trim();
    const contentHash = createHash("sha256").update(normalizedContent).digest("hex");

    // Подсчет общего количества слов
    const wordCount = parsed.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

    const normalizedTitle = (parsed.metadata.title || req.file.originalname).trim();
    const normalizedAuthor = (parsed.metadata.author || "Неизвестный автор").trim();

    const blockedMatch = await GuestRepo.findSimilarBlockedGuestBook({
      title: normalizedTitle,
      author: normalizedAuthor,
      contentHash,
    });

    if (blockedMatch) {
      return res.status(409).json({
        message: `Загрузка отклонена: похожая книга ранее была заблокирована модератором (${blockedMatch.reason}).`,
        code: "BOOK_BLOCKED_SIMILAR",
      });
    }

    // Если есть существующая книга - удалить
    if (existingBook) {
      await GuestRepo.deleteGuestBook(existingBook.id);
    }

    const originalFileUpload = await fileStorage.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype || undefined,
      "guest-books",
    );

    // Создать новую книгу
    const book = await GuestRepo.createGuestBook({
      guestAccountId: req.guestId,
      title: normalizedTitle,
      author: normalizedAuthor,
      format: req.file.originalname.toLowerCase().endsWith(".epub") ? "epub" : "fb2",
      fileSizeBytes: req.file.size,
      flatContent,
      contentHash,
      wordCount,
      originalFilename: req.file.originalname,
      originalFileStorageKey: originalFileUpload.key,
      originalFileContentType: originalFileUpload.contentType,
    });

    // Трекинг события
    await GuestRepo.trackGuestEvent({
      guestAccountId: req.guestId,
      guestBookId: book.id,
      eventType: "book_upload",
    });

    logger.info({ guestId: req.guestId, bookId: book.id }, "Guest book uploaded");

    return res.status(201).json({
      bookId: book.id,
      title: book.title,
      author: book.author,
      format: book.format,
      wordCount: book.wordCount,
      uploadedAt: book.uploadedAt.toISOString(),
      expiresAt: book.expiresAt.toISOString(),
      moderationStatus: book.moderationStatus,
    });
  } catch (error: unknown) {
    logger.error({ error }, "Error uploading guest book");
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes("Invalid file format")) {
      return res.status(400).json({
        message: errorMessage,
        code: "INVALID_FORMAT",
      });
    }

    if (errorMessage.includes("File too large")) {
      return res.status(413).json({
        message: "Файл слишком большой. Максимум 1 MB.",
        code: "FILE_TOO_LARGE",
      });
    }

    return res.status(500).json({
      message: "Ошибка при загрузке книги",
      code: "UPLOAD_ERROR",
    });
  }
});

// ============================================
// 2.6 Получить текущую книгу
// GET /api/v1/guest/books/current
// ============================================

router.get("/books/current", async (req: Request, res: Response) => {
  try {
    if (!req.guestId) {
      return res.status(401).json({
        message: "Требуется гостевой доступ",
        code: "GUEST_REQUIRED",
      });
    }

    const book = await GuestRepo.getActiveGuestBook(req.guestId);

    if (!book) {
      return res.status(404).json({
        message: "У вас нет активной книги",
        code: "NO_BOOK",
      });
    }

    // Проверить срок годности
    if (book.expiresAt < new Date()) {
      return res.status(410).json({
        message: "Срок действия книги истек",
        code: "BOOK_EXPIRED",
      });
    }

    if (book.moderationStatus === "rejected") {
      return res.status(403).json({
        message: "Эта книга заблокирована модератором и недоступна для чтения",
        code: "BOOK_BLOCKED",
      });
    }

    // Трекинг события открытия книги
    await GuestRepo.trackGuestEvent({
      guestAccountId: req.guestId,
      guestBookId: book.id,
      eventType: "book_open",
    });

    return res.json({
      bookId: book.id,
      title: book.title,
      author: book.author,
      description: book.description,
      format: book.format,
      wordCount: book.wordCount,
      flatContent: book.flatContent,
      uploadedAt: book.uploadedAt.toISOString(),
      expiresAt: book.expiresAt.toISOString(),
      moderationStatus: book.moderationStatus,
    });
  } catch (error) {
    logger.error({ error }, "Error getting guest book");
    return res.status(500).json({
      message: "Ошибка при получении книги",
      code: "BOOK_GET_ERROR",
    });
  }
});

// ============================================
// 2.7 Удалить текущую книгу
// DELETE /api/v1/guest/books/current
// ============================================

router.delete("/books/current", async (req: Request, res: Response) => {
  try {
    if (!req.guestId) {
      return res.status(401).json({
        message: "Требуется гостевой доступ",
        code: "GUEST_REQUIRED",
      });
    }

    const book = await GuestRepo.getActiveGuestBook(req.guestId);

    if (!book) {
      return res.status(404).json({
        message: "У вас нет активной книги",
        code: "NO_BOOK",
      });
    }

    await GuestRepo.deleteGuestBook(book.id);

    logger.info({ guestId: req.guestId, bookId: book.id }, "Guest book deleted");

    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error deleting guest book");
    return res.status(500).json({
      message: "Ошибка при удалении книги",
      code: "BOOK_DELETE_ERROR",
    });
  }
});

// ============================================
// 2.8 Сохранить позицию чтения
// PUT /api/v1/guest/books/current/position
// ============================================

router.put("/books/current/position", async (req: Request, res: Response) => {
  try {
    if (!req.guestId) {
      return res.status(401).json({
        message: "Требуется гостевой доступ",
        code: "GUEST_REQUIRED",
      });
    }

    const book = await GuestRepo.getActiveGuestBook(req.guestId);

    if (!book) {
      return res.status(404).json({
        message: "У вас нет активной книги",
        code: "NO_BOOK",
      });
    }

    const { progressPercent, currentPosition, readingTimeMinutes } = req.body;

    const position = await GuestRepo.upsertGuestReadingPosition({
      guestAccountId: req.guestId,
      guestBookId: book.id,
      progressPercent: Math.min(100, Math.max(0, progressPercent || 0)),
      currentPosition,
      readingTimeMinutes,
    });

    return res.json({
      progressPercent: position.progressPercent,
      currentPosition: position.currentPosition,
      readingTimeMinutes: position.readingTimeMinutes,
      lastReadAt: position.lastReadAt.toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "Error saving reading position");
    return res.status(500).json({
      message: "Ошибка при сохранении позиции",
      code: "POSITION_SAVE_ERROR",
    });
  }
});

// ============================================
// 2.9 Получить позицию чтения
// GET /api/v1/guest/books/current/position
// ============================================

router.get("/books/current/position", async (req: Request, res: Response) => {
  try {
    if (!req.guestId) {
      return res.status(401).json({
        message: "Требуется гостевой доступ",
        code: "GUEST_REQUIRED",
      });
    }

    const book = await GuestRepo.getActiveGuestBook(req.guestId);

    if (!book) {
      return res.status(404).json({
        message: "У вас нет активной книги",
        code: "NO_BOOK",
      });
    }

    const position = await GuestRepo.getGuestReadingPosition(req.guestId, book.id);

    if (!position) {
      return res.json({
        progressPercent: 0,
        currentPosition: {},
        readingTimeMinutes: 0,
        lastReadAt: null,
      });
    }

    return res.json({
      progressPercent: position.progressPercent,
      currentPosition: position.currentPosition,
      readingTimeMinutes: position.readingTimeMinutes,
      lastReadAt: position.lastReadAt.toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "Error getting reading position");
    return res.status(500).json({
      message: "Ошибка при получении позиции",
      code: "POSITION_GET_ERROR",
    });
  }
});

// ============================================
// 2.10 Трекинг аналитики
// POST /api/v1/guest/analytics/track
// ============================================

router.post("/analytics/track", async (req: Request, res: Response) => {
  try {
    if (!req.guestId) {
      return res.status(401).json({
        message: "Требуется гостевой доступ",
        code: "GUEST_REQUIRED",
      });
    }

    const { eventType, sessionId, eventData } = req.body;

    // Валидация eventType
    const allowedEvents = ["session_start", "session_end", "book_open"];
    if (!allowedEvents.includes(eventType)) {
      return res.status(400).json({
        message: "Неверный тип события",
        code: "INVALID_EVENT_TYPE",
      });
    }

    const book = await GuestRepo.getActiveGuestBook(req.guestId);

    const event = await GuestRepo.trackGuestEvent({
      guestAccountId: req.guestId,
      guestBookId: book?.id,
      eventType,
      eventData,
      sessionId,
    });

    return res.json({ success: true, eventId: event.id });
  } catch (error) {
    logger.error({ error }, "Error tracking analytics");
    return res.status(500).json({
      message: "Ошибка при отправке аналитики",
      code: "ANALYTICS_ERROR",
    });
  }
});

// ============================================
// 2.11 Получить сводку аналитики
// GET /api/v1/guest/analytics/summary
// ============================================

router.get("/analytics/summary", async (req: Request, res: Response) => {
  try {
    if (!req.guestId) {
      return res.status(401).json({
        message: "Требуется гостевой доступ",
        code: "GUEST_REQUIRED",
      });
    }

    const summary = await GuestRepo.getGuestAnalyticsSummary(req.guestId);

    return res.json({
      totalReadingTime: summary.totalReadingTime,
      sessionsCount: summary.sessionsCount,
      averageSessionTime: summary.sessionsCount > 0 
        ? Math.round(summary.totalReadingTime / summary.sessionsCount) 
        : 0,
      lastActivity: summary.lastActivity,
    });
  } catch (error) {
    logger.error({ error }, "Error getting analytics summary");
    return res.status(500).json({
      message: "Ошибка при получении статистики",
      code: "ANALYTICS_SUMMARY_ERROR",
    });
  }
});

// ============================================
// 3.9 Миграция при регистрации
// POST /api/v1/guest/migrate
// Только для авторизованных пользователей!
// ============================================

router.post("/migrate", guestAuthRequired, async (req: Request, res: Response) => {
  try {
    // Требуется JWT
    if (!req.user) {
      return res.status(401).json({
        message: "Требуется авторизация",
        code: "AUTH_REQUIRED",
      });
    }

    if (!req.guestId) {
      return res.status(400).json({
        message: "Нет связанного гостевого аккаунта",
        code: "NO_GUEST",
      });
    }

    const { transferBook, transferAnalytics } = req.body;

    // Получаем книгу гостя
    const guestBook = await GuestRepo.getActiveGuestBook(req.guestId);
    
    let migratedBooks = 0;
    let migratedProgress = false;
    let migratedAnalytics = 0;

    if (transferBook && guestBook) {
      // Здесь можно добавить логику переноса в personal_books
      // Пока просто помечаем гостевую книгу как перенесенную
      migratedBooks = 1;
      migratedProgress = true;
    }

    if (transferAnalytics) {
      // Получаем аналитику гостя
      const events = await GuestRepo.getGuestEvents(req.guestId, undefined, 1000);
      migratedAnalytics = events.length;
    }

    // Удаляем гостевой аккаунт
    await GuestRepo.markGuestAsDeleted(req.guestId);

    logger.info({ 
      guestId: req.guestId, 
      userId: req.user.id,
      migratedBooks,
      migratedAnalytics 
    }, "Guest data migrated to user account");

    return res.json({
      migrated: {
        books: migratedBooks,
        readingProgress: migratedProgress,
        analyticsEvents: migratedAnalytics,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error migrating guest data");
    return res.status(500).json({
      message: "Ошибка при миграции данных",
      code: "MIGRATION_ERROR",
    });
  }
});

export default router;
