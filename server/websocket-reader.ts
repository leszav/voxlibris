import { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import jwt, { JwtPayload } from "jsonwebtoken";
import { db } from "./db.js";
import { users, readingProgress, bookmarks, notes, books, clubMembers } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";
import type {
  ReaderProgressUpdate,
  BookmarkUpdate,
  NoteUpdate,
} from "../shared/schema.js";
import { logger } from "./lib/logger.js";

interface AuthenticatedSocket extends Socket {
  userId: string;
  username: string;
}

// Улучшенная аутентификация через JWT с проверкой пользователя в БД
async function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
    
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "[WS Reader] Error joining book");
        socket.emit("error", { message: "Failed to join book room" });
      }
    });

    // Обновление прогресса чтения
    socket.on("progress_update", async (data: ReaderProgressUpdate) => {
      try {
        // Сохранение прогресса в БД (с debounce на клиенте)
        await db
          .insert(readingProgress)
          .values({
            userId: authSocket.userId,
            bookId: data.bookId,
            clubId: data.clubId,
            currentChapter: data.currentChapter,
            currentPosition: data.currentPosition,
            progress: data.progress,
            lastReadAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [readingProgress.userId, readingProgress.bookId],
            set: {
              currentChapter: data.currentChapter,
              currentPosition: data.currentPosition,
              progress: data.progress,
              lastReadAt: new Date(),
              updatedAt: new Date(),
            },
          });

        // Broadcast в комнату (для клубов)
        if (data.clubId) {
          const roomName = `club:${data.clubId}:book:${data.bookId}`;
          socket.to(roomName).emit("member_progress", {
            userId: authSocket.userId,
            username: authSocket.username,
            currentChapter: data.currentChapter,
            progress: data.progress,
            timestamp: new Date().toISOString(),
          });
        }
        
        socket.emit("progress_saved", { success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "[WS Reader] Error updating progress");
        socket.emit("error", { message: "Failed to save progress" });
      }
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

    // Проверка существования книги
    const [book] = await db.select().from(books).where(eq(books.id, bookId)).limit(1);
    if (!book) return false;

    // Если это персональная книга
    if (book.uploadedBy === userId) {
      return true;
    }

    // Если это клубная книга - проверить членство
    if (clubId) {
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

    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '[WS Reader] Error verifying book access');
    return false;
  }
}
