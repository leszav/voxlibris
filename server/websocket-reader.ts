import { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import jwt, { JwtPayload } from "jsonwebtoken";
import { db } from "./db.js";
import { users, readingProgress, bookmarks, notes, books, clubBooks, clubMembers } from "../shared/schema.js";
import { eq, and, desc, isNull } from "drizzle-orm";
import type {
  ReaderProgressUpdate,
  BookmarkUpdate,
  NoteUpdate,
} from "../shared/schema.js";
import { logger } from "./lib/logger.js";
import { getIcecastStreamUrl } from "./lib/icecast-public-url.js";
import { syncBookReadingStatus } from "./lib/sync-reading-status.js";
import { liveSessionsStore, type LiveReaderEntry } from "./lib/live-sessions-store.js";

interface AuthenticatedSocket extends Socket {
  userId: string;
  username: string;
}

interface ReaderPositionWithTimestamp {
  timestamp?: number;
}

interface DatabaseErrorLike {
  code?: string;
}

type NormalizedProgressUpdate = {
  clubId: string | null;
  currentChapter: number;
  currentPosition: string;
  progress: number;
};

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

function normalizeProgressUpdate(data: ReaderProgressUpdate): NormalizedProgressUpdate {
  const clubId = typeof data.clubId === "string" && data.clubId.length > 0 ? data.clubId : null;
  const currentChapter = typeof data.currentChapter === "number" && data.currentChapter > 0 ? data.currentChapter : 1;
  const currentPosition = typeof data.currentPosition === "string"
    ? data.currentPosition
    : JSON.stringify(data.currentPosition || {});
  const progress = typeof data.progress === "number" ? data.progress : 0;

  return {
    clubId,
    currentChapter,
    currentPosition,
    progress,
  };
}

async function findLatestProgress(userId: string, bookId: string, clubId: string | null) {
  const [existingProgress] = await db
    .select({
      id: readingProgress.id,
      currentPosition: readingProgress.currentPosition,
    })
    .from(readingProgress)
    .where(and(
      eq(readingProgress.userId, userId),
      eq(readingProgress.bookId, bookId),
      clubId ? eq(readingProgress.clubId, clubId) : isNull(readingProgress.clubId),
    ))
    .orderBy(desc(readingProgress.updatedAt), desc(readingProgress.lastReadAt))
    .limit(1);

  return existingProgress;
}

async function updateProgressRecord(
  progressId: string,
  normalized: NormalizedProgressUpdate,
) {
  await db
    .update(readingProgress)
    .set({
      currentChapter: normalized.currentChapter,
      currentPosition: normalized.currentPosition,
      progress: normalized.progress,
      clubId: normalized.clubId,
      lastReadAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(readingProgress.id, progressId));
}

async function saveReadingProgress(
  userId: string,
  bookId: string,
  normalized: NormalizedProgressUpdate,
): Promise<{ stale: boolean }> {
  const existingProgress = await findLatestProgress(userId, bookId, normalized.clubId);

  if (existingProgress) {
    const stale = isStaleProgressUpdate(existingProgress.currentPosition, normalized.currentPosition);
    if (stale) {
      return { stale: true };
    }

    await updateProgressRecord(existingProgress.id, normalized);
    return { stale: false };
  }

  try {
    await db
      .insert(readingProgress)
      .values({
        userId,
        bookId,
        clubId: normalized.clubId,
        currentChapter: normalized.currentChapter,
        currentPosition: normalized.currentPosition,
        progress: normalized.progress,
        lastReadAt: new Date(),
        updatedAt: new Date(),
      });

    return { stale: false };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const currentProgress = await findLatestProgress(userId, bookId, normalized.clubId);
    if (currentProgress && !isStaleProgressUpdate(currentProgress.currentPosition, normalized.currentPosition)) {
      await updateProgressRecord(currentProgress.id, normalized);
    }

    return { stale: false };
  }
}

async function handleProgressUpdate(
  socket: Socket,
  authSocket: AuthenticatedSocket,
  data: ReaderProgressUpdate,
): Promise<void> {
  try {
    const normalized = normalizeProgressUpdate(data);
    const saveResult = await saveReadingProgress(authSocket.userId, data.bookId, normalized);

    if (saveResult.stale) {
      socket.emit("progress_saved", { success: true, ignored: true, reason: "stale_progress_update" });
      return;
    }

    try {
      const bookType = normalized.clubId ? "club" : "personal";
      await syncBookReadingStatus({
        userId: authSocket.userId,
        bookId: data.bookId,
        bookType,
        progress: normalized.progress,
      });
    } catch (statusError) {
      const errorMessage = statusError instanceof Error ? statusError.message : String(statusError);
      logger.error({ error: errorMessage }, "[WS Reader] Error updating book reading status");
    }

    if (normalized.clubId) {
      const roomName = `club:${normalized.clubId}:book:${data.bookId}`;
      socket.to(roomName).emit("member_progress", {
        userId: authSocket.userId,
        username: authSocket.username,
        currentChapter: normalized.currentChapter,
        progress: normalized.progress,
        timestamp: new Date().toISOString(),
      });
    }

    socket.emit("progress_saved", { success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[WS Reader] Error updating progress");
    socket.emit("error", { message: "Failed to save progress" });
  }
}

// Улучшенная аутентификация через JWT с проверкой пользователя в БД
async function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    const cookieTokenRaw = typeof cookieHeader === 'string'
      ? cookieHeader
          .split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith('accessToken='))
          ?.split('=')[1]
      : undefined;
    const cookieToken = cookieTokenRaw ? decodeURIComponent(cookieTokenRaw) : undefined;

    const token = socket.handshake.auth.token
      || socket.handshake.headers.authorization?.replace("Bearer ", "")
      || cookieToken;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      return next(new Error('JWT_SECRET not configured'));
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { userId: string; username: string };
    
    if (!decoded.userId || !decoded.username) {
      return next(new Error('Invalid token format'));
    }

    // Проверить существование пользователя
    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    if (!user?.status || user.status !== 'active') {
      return next(new Error('User not found or inactive'));
    }

    (socket as AuthenticatedSocket).userId = decoded.userId;
    (socket as AuthenticatedSocket).username = decoded.username;
    
    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '[WebSocket] Authentication error');
    next(new Error('Authentication failed'));
  }
}

export function initializeReaderWebSocket(httpServer: HttpServer) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:5173", "http://localhost:3000"];

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    path: "/ws/reader",
  });

  // Применяем middleware аутентификации
  io.use(authenticateSocket);

  io.on("connection", (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    logger.info(`[WS Reader] User ${authSocket.username} (${authSocket.userId}) connected`);

    // Присоединение к комнате книги
    socket.on("join_book", async (data: { bookId: string; clubId?: string }) => {
      try {
        const { bookId, clubId } = data;
        
        // Проверка доступа к книге
        const hasAccess = await verifyBookAccess(authSocket.userId, bookId, clubId);
        if (!hasAccess) {
          socket.emit("error", { message: "Access denied to this book" });
          return;
        }

        const roomName = clubId ? `club:${clubId}:book:${bookId}` : `book:${bookId}`;
        await socket.join(roomName);
        
        logger.info(`[WS Reader] User ${authSocket.username} joined room: ${roomName}`);
        
        // Уведомление о присоединении
        socket.to(roomName).emit("user_joined", {
          userId: authSocket.userId,
          username: authSocket.username,
          timestamp: new Date().toISOString(),
        });

        socket.emit("joined_book", { bookId, clubId, roomName });

        // Отправляем подключившемуся текущих активных чтецов этой книги
        if (clubId) {
          const currentReaders = (await liveSessionsStore.getByClub(clubId)).filter(
            (r) => r.bookId === bookId
          );
          for (const reader of currentReaders) {
            socket.emit('live_reader:started', reader);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "[WS Reader] Error joining book");
        socket.emit("error", { message: "Failed to join book room" });
      }
    });

    // Обновление прогресса чтения
    socket.on("progress_update", async (data: ReaderProgressUpdate) => {
      await handleProgressUpdate(socket, authSocket, data);
    });

    // Добавление закладки
    socket.on("bookmark_add", async (data: Omit<BookmarkUpdate["bookmark"], "id" | "userId" | "createdAt">) => {
      try {
        const [bookmark] = await db
          .insert(bookmarks)
          .values({
            userId: authSocket.userId,
            ...data,
          })
          .returning();

        socket.emit("bookmark_added", { bookmark });
        
        logger.info(`[WS Reader] Bookmark added by ${authSocket.username} for book ${data.bookId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "[WS Reader] Error adding bookmark");
        socket.emit("error", { message: "Failed to add bookmark" });
      }
    });

    // Добавление заметки
    socket.on("note_add", async (data: Omit<NoteUpdate["note"], "id" | "userId" | "createdAt" | "updatedAt">) => {
      try {
        const [note] = await db
          .insert(notes)
          .values({
            userId: authSocket.userId,
            ...data,
          })
          .returning();

        socket.emit("note_added", { note });
        
        logger.info(`[WS Reader] Note added by ${authSocket.username} for book ${data.bookId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "[WS Reader] Error adding note");
        socket.emit("error", { message: "Failed to add note" });
      }
    });

    // Выход из комнаты книги
    socket.on("leave_book", (data: { bookId: string; clubId?: string }) => {
      const roomName = data.clubId ? `club:${data.clubId}:book:${data.bookId}` : `book:${data.bookId}`;
      socket.leave(roomName);
      
      socket.to(roomName).emit("user_left", {
        userId: authSocket.userId,
        username: authSocket.username,
        timestamp: new Date().toISOString(),
      });
      
      logger.info(`[WS Reader] User ${authSocket.username} left room: ${roomName}`);
    });

    socket.on("disconnect", () => {
      logger.info(`[WS Reader] User ${authSocket.username} (${authSocket.userId}) disconnected`);
      void (async () => {
        const currentClubRooms = socket.rooms;
        for (const room of currentClubRooms) {
          if (!room.startsWith('club:')) continue;
          const clubId = room.replace('club:', '');
          const readers = await liveSessionsStore.getByClub(clubId);
          for (const entry of readers) {
            if (entry.readerId !== authSocket.userId) continue;
            await liveSessionsStore.remove(entry.sessionId, entry.clubId);
            const roomName = `club:${entry.clubId}:book:${entry.bookId}`;
            const clubRoom = `club:${entry.clubId}`;
            io.to(roomName).emit('live_reader:ended', { sessionId: entry.sessionId, readerId: authSocket.userId });
            io.to(clubRoom).emit('live_reader:ended', { sessionId: entry.sessionId, readerId: authSocket.userId });
          }
        }
      })();
    });

    // ── Live-чтецы: события для клубной комнаты ──────────────────────────

    /**
     * Чтец начал читать вслух.
     * Отправляет уведомление всем в комнате club:${clubId}:book:${bookId}.
     */
    socket.on("live_reader:start", async (data: {
      clubId: string;
      bookId: string;
      sessionId: string;
      chapter: number;
      readerName: string;
    }) => {
      const { clubId, bookId, sessionId, chapter, readerName } = data;
      logger.info({ clubId, bookId, sessionId, readerId: authSocket.userId }, '[WS Reader] live_reader:start received');
      const roomName = `club:${clubId}:book:${bookId}`;
      const clubRoom = `club:${clubId}`;

      // Проверяем доступ
      const canAccess = await verifyBookAccess(authSocket.userId, bookId, clubId);
      if (!canAccess) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Присоединяемся к клубной комнате если ещё нет
      socket.join(clubRoom);

      const readerEntry: LiveReaderEntry = {
        sessionId,
        readerId: authSocket.userId,
        readerName,
        chapter,
        streamUrl: getIcecastStreamUrl(sessionId),
        startedAt: new Date().toISOString(),
        clubId,
        bookId,
      };
      await liveSessionsStore.upsert(readerEntry);

      // Уведомляем всех в комнате книги
      socket.to(roomName).emit('live_reader:started', readerEntry);
      // И всех в клубной комнате (кто не открыл книгу)
      socket.to(clubRoom).emit('live_reader:started', readerEntry);

      logger.info(`[WS Reader] ${readerName} started live reading in club ${clubId}`);
    });

    /**
     * Чтец закончил читать.
     */
    socket.on("live_reader:stop", async (data: { clubId: string; bookId: string; sessionId: string }) => {
      const { clubId, bookId, sessionId } = data;
      const roomName = `club:${clubId}:book:${bookId}`;
      const clubRoom = `club:${clubId}`;

      await liveSessionsStore.remove(sessionId, clubId);

      socket.to(roomName).emit('live_reader:ended', {
        sessionId,
        readerId: authSocket.userId,
        endedAt: new Date().toISOString(),
      });
      socket.to(clubRoom).emit('live_reader:ended', {
        sessionId,
        readerId: authSocket.userId,
        endedAt: new Date().toISOString(),
      });

      logger.info(`[WS Reader] ${authSocket.username} stopped live reading in club ${clubId}`);
    });

    /**
     * Синхронизация позиции чтения для слушателей.
     */
    socket.on("live_reader:position", async (data: {
      clubId: string;
      bookId: string;
      sessionId: string;
      chapter: number;
      positionRaw: string;
    }) => {
      const { clubId, bookId, sessionId, chapter, positionRaw } = data;
      const roomName = `club:${clubId}:book:${bookId}`;

      await liveSessionsStore.updatePosition(sessionId, chapter, positionRaw);

      socket.to(roomName).emit('live_reader:position_update', {
        sessionId,
        readerId: authSocket.userId,
        chapter,
        positionRaw,
        timestamp: Date.now(),
      });
    });

    socket.on('live_reader:heartbeat', async (data: { sessionId: string }) => {
      await liveSessionsStore.heartbeat(data.sessionId);
    });

    /**
     * Присоединиться к клубной комнате для получения уведомлений о чтецах.
     */
    socket.on("join_club", async (data: { clubId: string }) => {
      const { clubId } = data;
      socket.join(`club:${clubId}`);
      logger.info(`[WS Reader] ${authSocket.username} joined club room ${clubId}`);

      // Отправляем подключившемуся текущих активных чтецов этого клуба
      const currentReaders = await liveSessionsStore.getByClub(clubId);
      for (const reader of currentReaders) {
        socket.emit('live_reader:started', reader);
      }
    });
  });

  logger.info("[WS Reader] WebSocket server initialized at /ws/reader");
  return io;
}

// Вспомогательная функция проверки доступа к книге

async function verifyBookAccess(userId: string, bookId: string, clubId?: string): Promise<boolean> {
  try {
    // Проверка существования пользователя
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.status || user.status !== 'active') return false;

    if (clubId) {
      const [clubBook] = await db
        .select()
        .from(clubBooks)
        .where(
          and(
            eq(clubBooks.id, bookId),
            eq(clubBooks.clubId, clubId),
            eq(clubBooks.isDeleted, false),
          )
        )
        .limit(1);

      if (!clubBook) return false;

      const [membership] = await db
        .select()
        .from(clubMembers)
        .where(
          and(
            eq(clubMembers.clubId, clubId),
            eq(clubMembers.userId, userId),
            eq(clubMembers.isActive, true)
          )
        )
        .limit(1);

      return !!membership;
    }

    // Legacy/personal books path
    const [book] = await db.select().from(books).where(eq(books.id, bookId)).limit(1);
    if (!book) return false;

    return book.uploadedBy === userId;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '[WS Reader] Error verifying book access');
    return false;
  }
}
