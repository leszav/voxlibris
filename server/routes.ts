import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import multer from "multer";
import { storage } from "./repositories/index.js";
import { fileStorage } from "./file-storage.js";
import { emailService } from "./services/email-service.js";
import personalBooksRouter from "./personal-books-routes.js";
import clubBooksRouter from "./club-books-routes.js";
import genresRouter from "./genres-routes.js";
import accessRouter from "./access-routes.js";
import clubDiscussionsRouter from "./club-discussions-routes.js";
import scheduleRouter from "./routes/schedule.js";
import notificationsRouter from "./routes/notifications.js";
import recordingsRouter from "./routes/recordings.js";
import sessionAnalyticsRouter from "./routes/session-analytics.js";
import readerQualityRouter from "./routes/reader-quality.js";
import { jwtAuth, requireActiveUser } from "./jwt-middleware.js";
import { logger } from "./lib/logger.js";
import { getPublicBaseUrl } from "./lib/public-base-url.js";
import { storeOptimizedImageIfNeeded } from "./lib/uploaded-image-storage.js";
import { activityService } from "./services/activity-service.js";
import { gamificationService } from "./services/gamification-service.js";
import {
  clearStudioStreamClosureIntent,
  setStudioStreamClosureIntent,
} from "./lib/studio-stream-intent-store.js";
import { sessionAnalyticsService } from "./services/session-analytics-service.js";
import { db } from "./db.js";
import { getIO } from "./lib/socket-registry.js";
import { getFeatureFlag } from "./lib/feature-flags.js";
import {
  analyticsEvents,
  insertClubSchema,
  insertBookSchema,
  type InsertAnalyticsEvent,
  type InsertBook
} from "../shared/schema.js";
import { isReaderLedClub } from "./lib/reader-club-access.js";

// Helper: robust lookup of invitation by token with fallbacks
async function findInvitationByToken(token: string) {
  if (!token) return undefined;
  // try direct lookup
  let inv = await storage.getClubInvitation(token);
  if (inv) return inv;

  // try decoded
  try {
    const decoded = decodeURIComponent(token);
    if (decoded && decoded !== token) {
      inv = await storage.getClubInvitation(decoded);
      if (inv) return inv;
    }
  } catch (err) {
    console.warn('Failed to decode invite token:', err);
  }

  // try lowercase
  const lower = token.toLowerCase();
  if (lower !== token) {
    inv = await storage.getClubInvitation(lower);
    if (inv) return inv;
  }

  return undefined;
}

function normalizeFavoriteGenresInput(input: unknown): string | null | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (input === null) {
    return null;
  }

  let rawValue = "";
  if (Array.isArray(input)) {
    const stringItems: string[] = [];
    for (const item of input) {
      if (typeof item === "string") {
        stringItems.push(item);
      }
    }
    rawValue = stringItems.join(",");
  } else if (typeof input === "string") {
    rawValue = input;
  }

  const normalized = rawValue
    .split(/[,;\n]+/u)
    .map((genre) => genre.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return null;
  }

  return Array.from(new Set(normalized)).join(", ");
}

// Улучшенный fileFilter с проверкой magic numbers
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = ['application/epub+zip', 'application/x-fictionbook+xml'];
  const allowedExtensions = ['.epub', '.fb2'];

  // Базовая проверка расширения
  const hasValidExtension = allowedExtensions.some(ext =>
    file.originalname.toLowerCase().endsWith(ext)
  );

  if (!hasValidExtension) {
    return cb(new Error('Invalid file extension. Only EPUB and FB2 files are allowed.'));
  }

  // Проверка MIME типа
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error(`Invalid MIME type: ${file.mimetype}`));
  }

  // Проверка размера файла (максимум 50MB)
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return cb(new Error(`File too large. Maximum size is 50MB.`));
  }

  cb(null, true);
};

// Обновить multer конфигурацию
const _upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1 // Только один файл за раз
  },
  fileFilter: fileFilter
});

// Добавить функцию валидации пути для защиты от Path Traversal
function validateStoragePath(path: string): { valid: boolean; normalizedPath?: string } {
  if (!path || typeof path !== 'string') {
    return { valid: false };
  }

  // Удалить leading slash
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

  logger.debug(`[validateStoragePath] Original path: "${path}", Normalized: "${normalizedPath}"`);

  // Проверки безопасности
  const dangerousPatterns = [
    /\.\./,  // Path traversal
    /\\/,    // Windows path separator
    /\0/,    // Null byte injection
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(normalizedPath)) {
      logger.debug(`[validateStoragePath] Failed dangerous pattern: ${pattern}`);
      return { valid: false };
    }
  }

  // Ограничить длину пути
  if (normalizedPath.length > 255) {
    logger.debug(`[validateStoragePath] Failed length check: ${normalizedPath.length}`);
    return { valid: false };
  }

  // Разрешить только определенные паттерны
  const allowedPatterns = [
    /^covers\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^covers\/(club|personal)\/[a-fA-F0-9-]+\/[a-fA-F0-9-]+-cover\.(jpg|jpeg|png|webp)$/,
    /^covers\/(club|personal)\/[a-fA-F0-9-]+\/manual\/[a-fA-F0-9-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^books\/[a-fA-F0-9-]+\/content\.(epub|fb2|html)$/,
    /^avatars\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^avatars\/[a-fA-F0-9-]+\/[a-zA-Z0-9_-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^profiles\/[a-fA-F0-9-]+\/[a-zA-Z0-9_-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^gamification\/reward-assets\/[a-zA-Z0-9_-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^gamification\/achievements\/[a-zA-Z0-9_-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
    /^clubs\/[a-fA-F0-9-]+\/[a-zA-Z0-9_-]+-[a-fA-F0-9-]+\.(jpg|jpeg|png|webp)$/,
  ];

  const isAllowed = allowedPatterns.some(pattern => {
    const matches = pattern.test(normalizedPath);
    logger.debug(`[validateStoragePath] Testing pattern ${pattern} against "${normalizedPath}": ${matches}`);
    return matches;
  });
  logger.debug(`[validateStoragePath] Final result: ${isAllowed}`);
  return { valid: isAllowed, normalizedPath: isAllowed ? normalizedPath : undefined };
}

async function recordAnalyticsEvent(req: Request, payload: Omit<InsertAnalyticsEvent, "userId" | "ipAddress" | "userAgent" | "metadata"> & { metadata?: Record<string, unknown> }) {
  try {
    const userId = req.user?.id ?? null;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const eventData: InsertAnalyticsEvent = {
      ...payload,
      userId,
      metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
      ipAddress,
      userAgent,
    };

    await db.insert(analyticsEvents).values(eventData);
  } catch (error) {
    logger.warn({ error, payload }, "[Analytics] Failed to record event in routes.ts");
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {


  // NOTE: Admin endpoints moved to admin-routes.ts to avoid conflicts

  // ===== NEW VOXLIBRIS UPLOAD API (Phase 2) =====
  app.use('/api/v1/user/books', personalBooksRouter);
  app.use('/api/v1/genres', genresRouter);
  app.use('/api/v1', clubBooksRouter);
  app.use('/api/v1', accessRouter);
  
  // ===== CLUB DISCUSSIONS API =====
  app.use('/api', clubDiscussionsRouter);

  // ===== SCHEDULE API (Phase 5) =====
  app.use('/api/schedule', jwtAuth, scheduleRouter);

  // ===== CLUBS API =====
  // Все club routes теперь в club-routes.ts

  // Public endpoint: Get invitation details (no auth required)
  app.get("/api/invitations/:token", async (req: Request, res: Response) => {
    try {
      const invitation = await storage.getClubInvitation(req.params.token);
      
      if (!invitation) {
        return res.status(404).json({ message: "Приглашение не найдено" });
      }

      // Если статус приглашения не pending — считаем его недействительным.
      // Заметьте: отклонённые приглашения теперь удаляются, поэтому здесь
      // может приходить только 'accepted' или 'expired'.
      if (invitation.status !== 'pending') {
        const statusMessage = invitation.status === 'accepted' ? 'принято' : 'не действительно';
        return res.status(410).json({ 
          message: `Приглашение уже ${statusMessage}`,
          status: invitation.status
        });
      }

      // Проверяем срок действия
      if (new Date(invitation.expiresAt) < new Date()) {
        await storage.updateInvitationStatus(req.params.token, 'expired');
        return res.status(410).json({ message: "Приглашение истекло", status: 'expired' });
      }

      const club = await storage.getClub(invitation.clubId);
      if (!club) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

      const inviter = await storage.getUser(invitation.invitedBy);

      // Возвращаем только публичную информацию, включая id и status
      // чтобы фронтенд мог корректно определить состояние приглашения
      res.json({
        club: {
          id: club.id,
          title: club.title,
          description: club.description,
          coverImage: club.coverImage,
          memberCount: club.memberCount,
          maxMembers: club.maxMembers,
          type: club.type,
        },
        invitation: {
          id: invitation.id,
          email: invitation.email,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          inviterName: inviter?.username || 'Участник клуба',
        }
      });
    } catch (error) {
      console.error("Get invitation error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Accept invitation endpoint (requires authentication)
  app.post("/api/invitations/:token/accept", jwtAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const invitation = await findInvitationByToken(req.params.token);
      if (!invitation) {
        logger.debug(`Invitation not found for token: ${req.params.token}`);
        return res.status(404).json({ message: 'Invitation not found' });
      }

      // Проверяем статус приглашения
      if (invitation.status !== 'pending') {
        return res.status(409).json({ 
          message: `Invitation already ${invitation.status}` 
        });
      }

      // Проверяем срок действия
      if (new Date(invitation.expiresAt) < new Date()) {
        await storage.updateInvitationStatus(req.params.token, 'expired');
        return res.status(410).json({ message: 'Invitation has expired' });
      }

      const club = await storage.getClub(invitation.clubId);
      if (!club) {
        return res.status(404).json({ message: 'Club not found' });
      }

      // Загружаем текущего пользователя для проверки email
      const currentUser = await storage.getUser(req.user.userId);
      if (!currentUser) {
        return res.status(401).json({ message: 'Пользователь не найден' });
      }

      // Принимать приглашение может только тот пользователь, на чей email оно было отправлено
      if (invitation.email && currentUser.email && invitation.email.toLowerCase() !== currentUser.email.toLowerCase()) {
        return res.status(403).json({
          message: 'Этот инвайт предназначен для другого email. Пожалуйста, войдите под приглашённым аккаунтом или зарегистрируйтесь.',
          code: 'INVITE_EMAIL_MISMATCH'
        });
      }

      // Проверяем, не заполнен ли клуб
      if (club.memberCount >= club.maxMembers) {
        return res.status(409).json({ message: 'Club is full' });
      }

      // Проверяем, не является ли пользователь уже участником
      const existingMembership = await storage.getUserClubMembership(club.id, req.user.userId);
      if (existingMembership) {
        // Обновляем статус приглашения
        await storage.updateInvitationStatus(req.params.token, 'accepted', new Date());
        return res.status(409).json({ message: 'You are already a member of this club' });
      }

      // Для reader-led клуба приглашённый пользователь становится слушателем.
      // В текущей модели ролей слушатель хранится как обычный active member;
      // доступ к тексту книги остаётся закрыт серверными guard'ами владельца.
      const membershipRole = 'member' as const;
      const membership = await storage.joinClub(club.id, req.user.userId, membershipRole);
      const listenerAccess = club.type === 'reader-led';

      // Обновляем статус приглашения
      await storage.updateInvitationStatus(req.params.token, 'accepted', new Date());

      // Отправляем уведомление владельцу клуба
      const inviter = await storage.getUser(invitation.invitedBy);
      if (inviter) {
        const baseUrl = await getPublicBaseUrl();
        await emailService.sendInvitationAccepted({
          email: inviter.email,
          clubName: club.title,
          memberName: req.user.username,
          baseUrl,
        });
      }

      logger.debug(`[Clubs] User ${req.user.username} accepted invitation to club "${club.title}"`);

      // Событие ленты: пользователь вступил в клуб
      activityService.emit({
        actorId: req.user.userId,
        eventType: 'joined_club',
        targetType: 'club',
        targetId: club.id,
        metadata: {
          clubId: club.id,
          clubName: club.title,
        },
      }).catch((err) => logger.warn('[activity] joined_club emit failed', err));

      res.json({
        message: 'Successfully joined the club',
        club: {
          id: club.id,
          title: club.title,
          description: club.description,
          type: club.type,
        },
        membership,
        listenerAccess,
      });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      res.status(500).json({ message: 'Failed to accept invitation' });
    }
  });

  // Decline invitation endpoint (requires authentication)
  app.post("/api/invitations/:token/decline", jwtAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const invitation = await storage.getClubInvitation(req.params.token);
      if (!invitation) {
        return res.status(404).json({ message: 'Invitation not found' });
      }

      // Проверяем статус приглашения
      if (invitation.status !== 'pending') {
        return res.status(409).json({ 
          message: `Invitation already ${invitation.status}` 
        });
      }

      // Вместо установки статуса 'declined' удаляем приглашение
      const deleted = await storage.deleteClubInvitation(invitation.id);
      if (!deleted) {
        console.warn(`[Clubs] Failed to delete declined invitation token ${req.params.token}`);
        return res.status(500).json({ message: 'Failed to decline invitation' });
      }

      logger.debug(`[Clubs] User declined and deleted invitation token ${req.params.token}`);

      res.json({ message: 'Invitation declined and removed' });
    } catch (error) {
      console.error('Error declining invitation:', error);
      res.status(500).json({ message: 'Failed to decline invitation' });
    }
  });

  // ===== CLUBS API =====
  app.put("/api/clubs/:id", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      // Check if club exists and user has permission
      const existingClub = await storage.getClub(id);
      if (!existingClub) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

      const isOwner = existingClub.ownerId === currentUser.id;
      const isAdmin = currentUser.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: "Недостаточно прав для изменения клуба" });
      }

      const validation = insertClubSchema.partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Ошибка валидации данных",
          errors: validation.error.issues
        });
      }

      const updatedClub = await storage.updateClub(id, validation.data);

      if (!updatedClub) {
        return res.status(404).json({ message: "Не удалось обновить клуб" });
      }

      res.json({
        message: "Клуб успешно обновлен",
        club: updatedClub
      });
    } catch (error) {
      console.error("Update club error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Delete club (owner or admin only)
  app.delete("/api/clubs/:id", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      const existingClub = await storage.getClub(id);
      if (!existingClub) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

      const isOwner = existingClub.ownerId === currentUser.id;
      const isAdmin = currentUser.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: "Недостаточно прав для удаления клуба" });
      }

      const success = await storage.deleteClub(id);

      if (!success) {
        return res.status(404).json({ message: "Не удалось удалить клуб" });
      }

      res.json({ message: "Клуб успешно удален" });
    } catch (error) {
      console.error("Delete club error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user's clubs
  app.get("/api/user/clubs", jwtAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;
      const clubs = await storage.getClubsByUser(userId);
      res.json({ clubs });
    } catch (error) {
      console.error("Get user clubs error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user's books (uploaded by user)
  app.get("/api/user/books", jwtAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;
      const books = await storage.getBooksByUser(userId);
      res.json({ books });
    } catch (error) {
      console.error("Get user books error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Join club
  app.post("/api/clubs/:id/join", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id: clubId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      // Check if club exists
      const club = await storage.getClub(clubId);
      if (!club) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

	  return res.status(403).json({
	    message: "Присоединение к клубу возможно только по приглашению.",
	    code: "INVITATION_REQUIRED"
	  });
    } catch (error) {
      console.error("Join club error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Leave club
  app.post("/api/clubs/:id/leave", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { id: clubId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;

      const success = await storage.leaveClub(clubId, userId);

      if (!success) {
        return res.status(404).json({ message: "Вы не являетесь участником этого клуба" });
      }

      await recordAnalyticsEvent(req, {
        eventType: "club_leave",
        clubId,
        bookId: null,
        chapterNumber: null,
        duration: null,
        progress: null,
      });

      res.json({ message: "Вы покинули клуб" });
    } catch (error) {
      console.error("Leave club error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // ===== BOOKS API =====

  // Get all books
  app.get("/api/books", async (req: Request, res: Response) => {
    try {
      const books = await storage.getBooks();
      res.json({ books });
    } catch (error) {
      console.error("Get books error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Search books (MUST be before /api/books/:id)
  app.get("/api/books/search", async (req: Request, res: Response) => {
    try {
      const { q: query } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: "Параметр поиска 'q' обязателен" });
      }

      const books = await storage.searchBooks(query);
      res.json({ books, query });
    } catch (error) {
      console.error("Search books error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Global search across clubs, books, users, and future features
  app.get("/api/search/global", async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      const rawLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 6;
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 20) : 6;

      if (!q || typeof q !== "string" || q.trim().length < 2) {
        return res.json({
          query: typeof q === "string" ? q : "",
          results: {
            clubs: [],
            books: [],
            users: [],
            features: [],
          },
        });
      }

      const query = q.trim();
      const queryLower = query.toLowerCase();

      const [clubs, books, users] = await Promise.all([
        storage.getPublicCatalogClubs(limit, undefined, query),
        storage.searchBooks(query),
        storage.searchUsers(query, limit),
      ]);

      const searchableFeatures = [
        { id: "catalog", title: "Каталог клубов", description: "Открыть все клубы", path: "/catalog", isFuture: false },
        { id: "readers", title: "Топ чтецов", description: "Раздел чтецов и рейтингов", path: "/readers", isFuture: false },
        { id: "library", title: "Моя библиотека", description: "Личные книги, история, закладки", path: "/library", isFuture: false },
        { id: "pricing", title: "Тарифы", description: "Тарифные планы и возможности", path: "/pricing", isFuture: false },
        { id: "become-reader", title: "Стать чтецом", description: "Подача заявки и onboarding", path: "/become-reader", isFuture: false },
        { id: "rules", title: "Правила сообщества", description: "Раздел в разработке", path: "", isFuture: true },
        { id: "privacy", title: "Приватность", description: "Раздел в разработке", path: "", isFuture: true },
        { id: "terms", title: "Условия", description: "Раздел в разработке", path: "", isFuture: true },
      ];

      const features = searchableFeatures
        .filter((item) => {
          const haystack = `${item.title} ${item.description}`.toLowerCase();
          return haystack.includes(queryLower);
        })
        .slice(0, limit);

      res.json({
        query,
        results: {
          clubs: clubs.slice(0, limit),
          books: books.slice(0, limit).map((book) => ({
            id: book.id,
            title: book.title,
            author: book.author,
          })),
          users: users.slice(0, limit).map((user) => ({
            id: user.id,
            username: user.username,
            status: user.status,
          })),
          features,
        },
      });
    } catch (error) {
      console.error("Global search error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get book by ID
  app.get("/api/books/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const book = await storage.getBook(id);

      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      res.json({ book });
    } catch (error) {
      console.error("Get book error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get book details with preview (for book details page)
  app.get("/api/books/:id/details", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const book = await storage.getBook(id);

      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      // Get uploader info
      const uploader = book.uploadedBy ? await storage.getUser(book.uploadedBy) : null;
      const uploaderProfile = uploader ? await storage.getUserProfile(uploader.id) : null;

      // Get first 2 chapters as preview (or first 3000 characters)
      const content = await storage.getBookContent(id);
      let previewText = '';
      let chapterTitle = '';

      if (content && content.length > 0) {
        // Take first 2 chapters or first 3000 characters
        const previewChapters = content.slice(0, 2);
        previewText = previewChapters.map(ch => ch.content).join('\n\n');
        
        if (previewText.length > 3000) {
          previewText = previewText.slice(0, 3000);
        }

        if (previewChapters[0]) {
          chapterTitle = previewChapters[0].title || 'Глава 1';
        }
      }

      res.json({
        id: book.id,
        title: book.title,
        author: book.author,
        description: book.description,
        coverUrl: book.coverUrl,
        publisher: book.publisher,
        publishedYear: book.publishDate, // используем publishDate как год
        language: book.language,
        isbn: book.isbn,
        createdAt: book.createdAt,
        uploadedBy: {
          id: uploader?.id || book.uploadedBy || 'unknown',
          username: uploader?.username || 'unknown',
          displayName: uploaderProfile?.displayName || uploader?.username || 'unknown',
        },
        preview: previewText ? {
          text: previewText,
          chapterTitle,
        } : undefined,
      });
    } catch (error) {
      console.error("Get book details error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get book content (all chapters or specific chapter)
  app.get("/api/books/:id/content", async (req: Request, res: Response) => {
    try {
      const { id: bookId } = req.params;
      const { chapter } = req.query;

      // Check if book exists
      const book = await storage.getBook(bookId);
      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      if (chapter) {
        const chapterNumber = Number.parseInt(chapter as string, 10);
        const chapterContent = await storage.getBookChapter(bookId, chapterNumber);

        if (!chapterContent) {
          return res.status(404).json({ message: "Глава не найдена" });
        }

        res.json({ chapter: chapterContent });
      } else {
        const content = await storage.getBookContent(bookId);
        res.json({ content });
      }
    } catch (error) {
      console.error("Get book content error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Upload book content (authenticated users only)
  app.post("/api/books/:id/content", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id: bookId } = req.params;
      const { chapterNumber, title, content, wordCount } = req.body;

      if (!chapterNumber || !title || !content) {
        return res.status(400).json({
          message: "Обязательные поля: chapterNumber, title, content"
        });
      }

      // Check if book exists
      const book = await storage.getBook(bookId);
      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      const contentData = {
        bookId,
        chapterNumber: Number.parseInt(chapterNumber, 10),
        title,
        content,
        wordCount: wordCount || content.split(/\s+/).length
      };

      const newContent = await storage.createBookContent(contentData);

      res.status(201).json({
        message: "Контент добавлен",
        content: newContent
      });
    } catch (error) {
      console.error("Upload book content error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Delete book content (authenticated users only)
  app.delete("/api/books/:bookId/content/:contentId", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { contentId } = req.params;

      await storage.deleteBookContent(contentId);

      res.json({ message: "Контент удален" });
    } catch (error) {
      console.error("Delete book content error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Upload new book from file (EPUB/FB2) - DEPRECATED/REMOVED in favor of new API
  // app.post("/api/books/upload", ...);

  // Create book manually (for testing or simple text books)
  app.post("/api/books", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      // Check user permissions
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Недостаточно прав для создания книг" });
      }

      const validation = insertBookSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          message: "Ошибка валидации данных",
          errors: validation.error.issues
        });
      }

      const newBook = await storage.createBook(validation.data);

      res.status(201).json({
        message: "Книга успешно создана",
        book: newBook
      });
    } catch (error) {
      console.error("Create book error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Update book metadata (authenticated users only - owner or admin)
  app.put("/api/books/:id", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      // Get the book to check ownership
      const book = await storage.getBook(id);
      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      // Check permissions: owner or admin can update
      if (book.uploadedBy !== currentUser.id && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Недостаточно прав для редактирования этой книги" });
      }

      // Validate update data
      const allowedUpdates = ['title', 'author', 'description', 'isbn', 'coverUrl'];
      const updates: Partial<InsertBook> = {};

      for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
          updates[key as keyof InsertBook] = req.body[key];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "Нет данных для обновления" });
      }

      const updatedBook = await storage.updateBook(id, updates);

      res.json({
        message: "Книга успешно обновлена",
        book: updatedBook
      });
    } catch (error) {
      console.error("Update book error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Delete book (authenticated users only - owner or admin)
  app.delete("/api/books/:id", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      // Get the book to check ownership
      const book = await storage.getBook(id);
      if (!book) {
        return res.status(404).json({ message: "Книга не найдена" });
      }

      // Check permissions: owner or admin can delete
      if (book.uploadedBy !== currentUser.id && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Недостаточно прав для удаления этой книги" });
      }

      // Delete associated file from storage if exists
      if (book.contentPath) {
        try {
          await fileStorage.deleteFile(book.contentPath);
          logger.debug(`Deleted file from storage: ${book.contentPath}`);
        } catch (fileError) {
          console.warn(`Failed to delete file from storage: ${book.contentPath}`, fileError);
          // Continue with database deletion even if file deletion fails
        }
      }

      // Delete cover image if exists
      if (book.coverUrl) {
        try {
          // Extract key from URL to delete cover
          const coverKey = book.coverUrl.split('/').pop();
          if (coverKey) {
            await fileStorage.deleteFile(`covers/${coverKey}`);
            logger.debug(`Deleted cover from storage: covers/${coverKey}`);
          }
        } catch (coverError) {
          console.warn(`Failed to delete cover from storage`, coverError);
        }
      }

      // Delete book from database (this will cascade delete content)
      await storage.deleteBook(id);

      res.json({ message: "Книга успешно удалена" });
    } catch (error) {
      console.error("Delete book error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // ===== READING SESSIONS API =====

  // Create new reading session (authenticated users only)
  app.post("/api/sessions", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;
      const { clubId, bookId, title, currentChapter = 1, currentPosition } = req.body;

      if (!clubId || !bookId || !title) {
        return res.status(400).json({
          message: "Обязательные поля: clubId, bookId, title"
        });
      }

      // Verify user is member of the club or is the owner
      const club = await storage.getClub(clubId);
      if (!club) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

      const membership = await storage.getUserClubMembership(clubId, userId);
      const isOwner = club.ownerId === userId && membership?.isActive === true;

      if (!membership?.isActive) {
        return res.status(403).json({ message: "Вы не являетесь участником этого клуба" });
      }

      if (isReaderLedClub(club) && !isOwner) {
        return res.status(403).json({ message: "В клубе чтецов Studio может запускать только владелец клуба" });
      }

      const sessionData = {
        clubId,
        bookId,
        title,
        currentChapter,
        currentPosition,
        readerId: userId
      };

      const session = await storage.createReadingSession(sessionData);

      res.status(201).json({
        message: "Сессия чтения создана",
        session
      });
    } catch (error) {
      console.error("Create reading session error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get reading session by ID
  app.get("/api/sessions/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = await storage.getReadingSession(id);

      if (!session) {
        return res.status(404).json({ message: "Сессия не найдена" });
      }

      res.json({ session });
    } catch (error) {
      console.error("Get reading session error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get active reading sessions in club
  app.get("/api/clubs/:id/sessions", async (req: Request, res: Response) => {
    try {
      const { id: clubId } = req.params;

      // Check if club exists
      const club = await storage.getClub(clubId);
      if (!club) {
        return res.status(404).json({ message: "Клуб не найден" });
      }

      const sessions = await storage.getActiveSessionsInClub(clubId);
      res.json({ sessions });
    } catch (error) {
      console.error("Get club sessions error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get sessions by reader
  app.get("/api/readers/:id/sessions", async (req: Request, res: Response) => {
    try {
      const { id: readerId } = req.params;
      const sessions = await storage.getSessionsByReader(readerId);
      res.json({ sessions });
    } catch (error) {
      console.error("Get reader sessions error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Start reading session (reader only)
  app.put("/api/sessions/:id/start", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;

      // Verify user is the reader for this session
      const session = await storage.getReadingSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Сессия не найдена" });
      }

      if (session.readerId !== userId) {
        return res.status(403).json({ message: "Только чтец может запустить эту сессию" });
      }

      await clearStudioStreamClosureIntent(sessionId);

      const success = await storage.startSession(sessionId);
      if (!success) {
        return res.status(400).json({ message: "Не удалось запустить сессию" });
      }

      const existingAnalytics = await sessionAnalyticsService.getSessionAnalytics(sessionId);
      if (!existingAnalytics) {
        await sessionAnalyticsService.initializeSessionAnalytics(sessionId);
      }

      // Уведомляем чтеца и слушателей что сессия официально в эфире.
      // Чтец может ещё не быть в room (join_session требует isLive=true),
      // поэтому ищем его сокет по userId и добавляем в room + эмитим напрямую.
      try {
        const io = getIO();
        const room = `session_${sessionId}`;
        // Найти все сокеты чтеца и добавить в room
        for (const [, sock] of io.sockets.sockets) {
          const authSock = sock as typeof sock & { userId?: string };
          if (authSock.userId === userId) {
            await authSock.join(room);
          }
        }
        io.to(room).emit("session_started", { sessionId });
      } catch {
        // io может не быть инициализирован в тестах — не критично
      }

      res.json({ message: "Сессия запущена" });
    } catch (error) {
      console.error("Start session error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // End reading session (reader only)
  app.put("/api/sessions/:id/end", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;

      // Verify user is the reader for this session
      const session = await storage.getReadingSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Сессия не найдена" });
      }

      if (session.readerId !== userId) {
        return res.status(403).json({ message: "Только чтец может завершить эту сессию" });
      }

      await setStudioStreamClosureIntent(sessionId, "end");

      const success = await storage.endSession(sessionId);
      if (!success) {
        return res.status(400).json({ message: "Не удалось завершить сессию" });
      }

      const existingAnalytics = await sessionAnalyticsService.getSessionAnalytics(sessionId);
      if (existingAnalytics) {
        await sessionAnalyticsService.finalizeSessionAnalytics(sessionId);
      }

      res.json({ message: "Сессия завершена" });
    } catch (error) {
      console.error("End session error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Update reading position (reader only)
  app.put("/api/sessions/:id/position", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;
      const { currentChapter, currentPosition } = req.body;

      if (currentChapter === undefined || !currentPosition) {
        return res.status(400).json({
          message: "Обязательные поля: currentChapter, currentPosition"
        });
      }

      // Verify user is the reader for this session
      const session = await storage.getReadingSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Сессия не найдена" });
      }

      if (session.readerId !== userId) {
        return res.status(403).json({ message: "Только чтец может обновлять позицию" });
      }

      const success = await storage.updateSessionPosition(sessionId, currentChapter, currentPosition);
      if (!success) {
        return res.status(400).json({ message: "Не удалось обновить позицию" });
      }

      res.json({ message: "Позиция обновлена" });
    } catch (error) {
      console.error("Update position error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Rate reader (listeners only)
  app.post("/api/sessions/:id/rate", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const { id: sessionId } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = user.id;
      const { rating, feedback } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          message: "Рейтинг должен быть от 1 до 5"
        });
      }

      // Get session to find reader
      const session = await storage.getReadingSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Сессия не найдена" });
      }

      // Prevent self-rating
      if (session.readerId === userId) {
        return res.status(400).json({ message: "Нельзя оценивать самого себя" });
      }

      const ratingData = {
        sessionId,
        readerId: session.readerId,
        raterId: userId,
        rating,
        feedback
      };

      await storage.rateReader(ratingData);
      res.json({ message: "Оценка сохранена" });
    } catch (error) {
      console.error("Rate session error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // ===== STORAGE PROXY API =====

  // Serve files from storage (covers, etc.)
  // Use prefix mounting to avoid path-to-regexp parameter regex incompatibilities
  app.use("/api/storage", async (req: Request, res: Response) => {
    try {
      if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
      }

      // req.path here is the path after the mounted prefix, keep leading '/'
      // Extract key from path (everything after /api/storage/)
      const raw = (req.path || req.url || '');
      const validation = validateStoragePath(raw);
      
      if (!validation.valid) {
        console.warn(`[Security] Invalid storage path attempted: ${raw}`);
        return res.status(400).json({ message: 'Invalid file path' });
      }

      const key = validation.normalizedPath!;

      try {
        const fileMetadata = await fileStorage.getFileMetadata(key);
        const fileBuffer = await fileStorage.getFile(key);

        res.setHeader('Content-Type', fileMetadata.contentType);
        res.setHeader('Content-Length', fileMetadata.size);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

        res.send(fileBuffer);
      } catch (error) {
        console.warn(`File not found in storage: ${key}`, error);
        res.status(404).json({ message: "File not found" });
        return;
      }
    } catch (error) {
      console.error("Storage proxy error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get reader ratings
  app.get("/api/readers/:id/ratings", async (req: Request, res: Response) => {
    try {
      const { id: readerId } = req.params;

      const ratings = await storage.getReaderRatings(readerId);
      const averageRating = await storage.getReaderAverageRating(readerId);

      res.json({
        ratings,
        averageRating,
        totalRatings: ratings.length
      });
    } catch (error) {
      console.error("Get reader ratings error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get top readers
  app.get("/api/readers/top", async (req: Request, res: Response) => {
    try {
      const limit = Number.parseInt(req.query.limit as string) || 10;
      const topReaders = await storage.getTopReaders(limit);
      res.json({ readers: topReaders });
    } catch (error) {
      console.error("Get top readers error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  app.get("/api/readers/landing-top/status", async (_req: Request, res: Response) => {
    try {
      const enabled = await getFeatureFlag("landing.topReaders.enabled", false);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json({ enabled });
    } catch (error) {
      console.error("Error getting landing top readers status:", error);
      res.status(500).json({ message: "Failed to get landing top readers status" });
    }
  });

  // ===== USER PROFILES API =====

  // Search users — делегировано server/routes/users.ts (optionalJwtAuth, FTS, тип all|readers|listeners)

  // Get current user profile
  app.get("/api/users/current/profile", jwtAuth, async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      logger.debug({ userId: currentUser.id }, "Getting profile for user");
      
      let profile = await storage.getUserProfile(currentUser.id);
      logger.debug({ profile }, "Profile found");

      // Создаем профиль если не существует
      if (!profile) {
        logger.debug({ userId: currentUser.id }, "Creating new profile for user");
        profile = await storage.createOrUpdateUserProfile(currentUser.id, {
          displayName: currentUser.username,
          isReader: false
        });
        logger.debug({ profile }, "Profile created");
      }

      if (!profile) {
        console.error("Failed to create profile for user:", currentUser.id);
        return res.status(404).json({ message: "Профиль не найден" });
      }

      res.json({ profile });
    } catch (error) {
      console.error("Get current user profile error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user profile
  app.get("/api/users/:id/profile", async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.params;

      // Проверяем, что пользователь существует
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      let profile = await storage.getUserProfile(userId);

      // Создаем профиль если не существует
      profile ??= await storage.createOrUpdateUserProfile(userId, {
        displayName: user.username,
        isReader: false
      });

      if (!profile) {
        return res.status(404).json({ message: "Профиль не найден" });
      }

      res.json({ profile });
    } catch (error) {
      console.error("Get user profile error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Update current user profile
  app.put("/api/users/current/profile", jwtAuth, async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      const isReader = req.body.isReader;
      const displayName = typeof req.body.displayName === 'string' ? req.body.displayName.trim() : null;
      const bio = typeof req.body.bio === 'string' ? req.body.bio.trim() : null;
      const hasProfileQuote = Object.hasOwn(req.body, 'profileQuote');
      const hasProfileQuoteAuthor = Object.hasOwn(req.body, 'profileQuoteAuthor');
      const profileQuote = typeof req.body.profileQuote === 'string' ? req.body.profileQuote.trim() : null;
      const profileQuoteAuthor = typeof req.body.profileQuoteAuthor === 'string' ? req.body.profileQuoteAuthor.trim() : null;
      const favoriteGenres = normalizeFavoriteGenresInput(req.body.favoriteGenres ?? req.body.favorite_genres);
      const avatar = await storeOptimizedImageIfNeeded(req.body.avatar, {
        type: "avatar",
        keyPrefix: `avatars/${currentUser.id}`,
        filenamePrefix: "avatar",
      });
      const coverImage = await storeOptimizedImageIfNeeded(req.body.coverImage, {
        type: "background",
        keyPrefix: `profiles/${currentUser.id}`,
        filenamePrefix: "cover",
      });

      const profileData: {
        displayName: string | null;
        avatar: string | null;
        coverImage: string | null;
        bio: string | null;
        profileQuote?: string | null;
        profileQuoteAuthor?: string | null;
        isReader: boolean;
        favoriteGenres?: string | null;
      } = {
        displayName,
        avatar: avatar ?? null,
        coverImage: coverImage ?? null,
        bio,
        isReader: Boolean(isReader),
      };
      if (hasProfileQuote) {
        profileData.profileQuote = profileQuote || null;
      }
      if (hasProfileQuoteAuthor) {
        profileData.profileQuoteAuthor = profileQuoteAuthor || null;
      }
      if (favoriteGenres !== undefined) {
        profileData.favoriteGenres = favoriteGenres;
      }

      const profile = await storage.createOrUpdateUserProfile(currentUser.id, profileData);

      gamificationService.syncUserStateAndAward(currentUser.id, 'profile_updated').catch((err) => {
        logger.warn({ err, userId: currentUser.id }, '[gamification] current profile sync failed');
      });

      res.json({
        message: "Профиль обновлен",
        profile
      });
    } catch (error) {
      console.error("Update current user profile error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Update user profile (user only)
  app.put("/api/users/:id/profile", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { id: profileUserId } = req.params;
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      // Users can only update their own profile (unless admin)
      if (currentUser.id !== profileUserId && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Недостаточно прав" });
      }

      const isReader = req.body.isReader;
      const displayName = typeof req.body.displayName === 'string' ? req.body.displayName.trim() : null;
      const bio = typeof req.body.bio === 'string' ? req.body.bio.trim() : null;
      const hasProfileQuote = Object.hasOwn(req.body, 'profileQuote');
      const hasProfileQuoteAuthor = Object.hasOwn(req.body, 'profileQuoteAuthor');
      const profileQuote = typeof req.body.profileQuote === 'string' ? req.body.profileQuote.trim() : null;
      const profileQuoteAuthor = typeof req.body.profileQuoteAuthor === 'string' ? req.body.profileQuoteAuthor.trim() : null;
      const favoriteGenres = normalizeFavoriteGenresInput(req.body.favoriteGenres ?? req.body.favorite_genres);
      const avatar = await storeOptimizedImageIfNeeded(req.body.avatar, {
        type: "avatar",
        keyPrefix: `avatars/${profileUserId}`,
        filenamePrefix: "avatar",
      });
      const coverImage = await storeOptimizedImageIfNeeded(req.body.coverImage, {
        type: "background",
        keyPrefix: `profiles/${profileUserId}`,
        filenamePrefix: "cover",
      });

      const profileData: {
        displayName: string | null;
        avatar: string | null;
        coverImage: string | null;
        bio: string | null;
        profileQuote?: string | null;
        profileQuoteAuthor?: string | null;
        isReader: boolean;
        favoriteGenres?: string | null;
      } = {
        displayName,
        avatar: avatar ?? null,
        coverImage: coverImage ?? null,
        bio,
        isReader: Boolean(isReader),
      };
      if (hasProfileQuote) {
        profileData.profileQuote = profileQuote || null;
      }
      if (hasProfileQuoteAuthor) {
        profileData.profileQuoteAuthor = profileQuoteAuthor || null;
      }
      if (favoriteGenres !== undefined) {
        profileData.favoriteGenres = favoriteGenres;
      }

      const profile = await storage.createOrUpdateUserProfile(profileUserId, profileData);

      gamificationService.syncUserStateAndAward(profileUserId, 'profile_updated').catch((err) => {
        logger.warn({ err, userId: profileUserId }, '[gamification] profile sync failed');
      });

      res.json({
        message: "Профиль обновлен",
        profile
      });
    } catch (error) {
      console.error("Update user profile error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get current user clubs
  app.get("/api/users/current/clubs", jwtAuth, async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userClubs = await storage.getClubsByUser(currentUser.id);
      res.json(userClubs);
    } catch (error) {
      console.error("Get current user clubs error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get current user books
  app.get("/api/users/current/books", jwtAuth, async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userBooks = await storage.getPersonalBooksByUser(currentUser.id);
      res.json(userBooks);
    } catch (error) {
      console.error("Get current user books error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user books
  app.get("/api/users/:id/books", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.params;
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }

      if (currentUser.id !== userId && currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Недостаточно прав" });
      }

      const userBooks = await storage.getPersonalBooksByUser(userId);
      res.json(userBooks);
    } catch (error) {
      console.error("Get user books error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user clubs
  app.get("/api/users/:id/clubs", async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.params;
      
      const userClubs = await storage.getClubsByUser(userId);

      // getClubsByUser уже возвращает ClubWithDetails[], не нужно дополнительно обогащать
      res.json(userClubs);
    } catch (error) {
      console.error("Get user clubs error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Update reading progress
  app.put("/api/progress", jwtAuth, async (req: Request, res: Response) => {
    logger.debug('[Progress] === Начало обработки PUT /api/progress ===');
      logger.debug({ user: req.user }, '[Progress] req.user');
      logger.debug({ body: req.body }, '[Progress] req.body');
      
      try {
        const currentUser = req.user;
        if (!currentUser) {
          return res.status(401).json({ message: "Пользователь не аутентифицирован" });
        }
        const userId = currentUser.id;
        const { bookId, clubId, currentChapter, currentPosition, progress } = req.body;

      logger.debug({ userId, bookId, clubId, currentChapter, currentPosition, progress }, '[Progress] Извлечённые данные');

      if (!bookId || currentChapter === undefined || progress === undefined) {
        logger.debug('[Progress] Валидация не прошла - отсутствуют обязательные поля');
        return res.status(400).json({
          message: "Обязательные поля: bookId, currentChapter, progress"
        });
      }

      const progressData = {
        userId,
        bookId,
        clubId,
        currentChapter,
        currentPosition,
        progress
      };

      logger.debug({ progressData }, '[Progress] Вызов storage.updateReadingProgress с данными');
      const updatedProgress = await storage.updateReadingProgress(progressData);
      logger.debug({ updatedProgress }, '[Progress] Успешно обновлено');

      // Если прогресс достиг 100% (или почти), добавляем в историю
      if (progress >= 99) {
        try {
          // Проверяем, не добавлена ли уже книга в историю
          const existingHistory = await storage.getReadingHistory(userId);
          const alreadyInHistory = existingHistory.some((h) => h.bookId === bookId);

          if (!alreadyInHistory) {
            // Получаем данные о книге из personal_books
            const bookData = await storage.getPersonalBook(bookId);
            
            if (bookData) {
              await storage.addCompletedToHistory(
                userId,
                bookId,
                bookData.title,
                bookData.author,
                bookData.coverUrl || undefined
              );
              logger.debug(`[Progress] Книга "${bookData.title}" добавлена в историю`);
            }
          }
        } catch (historyError) {
          console.error('[Progress] Ошибка добавления в историю:', historyError);
        }
      }

      res.json({
        message: "Прогресс обновлен",
        progress: updatedProgress
      });
    } catch (error) {
      console.error("[Progress] КРИТИЧЕСКАЯ ОШИБКА:", error);
      console.error("[Progress] Stack trace:", error instanceof Error ? error.stack : 'Нет stack trace');
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Get user reading progress for a book
  app.get("/api/progress/:bookId", jwtAuth, async (req: Request, res: Response) => {
    try {
      const { bookId } = req.params;
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Пользователь не аутентифицирован" });
      }
      const userId = currentUser.id;

      const progress = await storage.getUserReadingProgress(userId, bookId);

      if (!progress) {
        return res.status(404).json({ message: "Прогресс не найден" });
      }

      res.json({ progress });
    } catch (error) {
      console.error("Get reading progress error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });



  // Health check endpoint
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ===== NOTIFICATIONS API (Phase 6) =====
  app.use("/api/notifications", jwtAuth, notificationsRouter);

  // ===== RECORDINGS API (Phase 7) =====
  app.use("/api/recordings", jwtAuth, recordingsRouter);

  // ===== SESSION ANALYTICS API (Phase 8) =====
  app.use("/api/session-analytics", jwtAuth, sessionAnalyticsRouter);

  // ===== READER QUALITY API (Phase 10) =====
  app.use("/api/reader-quality", jwtAuth, readerQualityRouter);

  return httpServer;
}
