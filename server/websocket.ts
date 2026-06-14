import { Server as SocketIOServer, Socket } from "socket.io";
import { storage } from "./repositories/index.js";
import { logger } from "./lib/logger.js";
import { AudioBroadcaster } from "./audio/audio-broadcaster.js";
import { authService } from "./auth-service.js";
import type { AudioChunk, AudioSessionConfig } from "./audio/types.js";
import type {
  SessionPositionUpdate,
  ListenerUpdate
} from "../shared/schema.js";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  currentSession?: string;
  peerId?: string;
  roomId?: string;
}

// Helper function to handle leaving current session
async function leaveCurrentSession(socket: AuthenticatedSocket) {
  if (!socket.currentSession || !socket.userId) return;

  try {
    // Remove from session listeners
    await storage.leaveSession(socket.currentSession, socket.userId);
    
    // Notify others in the session
    const listenerUpdate: ListenerUpdate = {
      sessionId: socket.currentSession,
      userId: socket.userId,
      action: 'leave',
      timestamp: new Date().toISOString()
    };

    socket.to(`session_${socket.currentSession}`).emit("listener_update", listenerUpdate);
    
    // Leave socket room
    await socket.leave(`session_${socket.currentSession}`);
    
    logger.info(`User ${socket.userId} left session ${socket.currentSession}`);
    socket.currentSession = undefined;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "Error leaving session");
  }
}

export function setupWebSocketHandlers(io: SocketIOServer) {
  // Получаем экземпляр AudioBroadcaster
  const audioBroadcaster = AudioBroadcaster.getInstance();
  
  // Authentication middleware for WebSocket connections
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const auth = socket.handshake.auth as Record<string, unknown> | undefined;
      const authToken = typeof auth?.token === "string" ? auth.token : undefined;
      const headerToken = socket.handshake.headers.authorization?.replace("Bearer ", "");
      const cookieToken = socket.handshake.headers.cookie?.match(/(?:^|;\s*)accessToken=([^;]+)/)?.[1];
      const token = authToken || headerToken || cookieToken;

      if (!token) {
        logger.error("WebSocket auth failed: missing access token");
        return next(new Error("Authentication required"));
      }

      const payload = authService.verifyAccessToken(token);
      if (!payload?.userId) {
        logger.error("WebSocket auth failed: invalid or expired token");
        return next(new Error("Invalid token"));
      }

      const user = await storage.getUser(payload.userId);
      if (user?.status !== "active") {
        logger.error({ userId: payload.userId }, "WebSocket auth failed: user inactive");
        return next(new Error("User not allowed"));
      }

      if (!user.emailConfirmed) {
        await storage.updateUserEmailConfirmation(user.id, true);
      }

      socket.userId = payload.userId;
      logger.info({ userId: payload.userId }, "WebSocket authenticated");
      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'WebSocket authentication error');
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    logger.info(`User ${socket.userId} connected to WebSocket`);

    // Join a reading session room
    socket.on("join_session", async (sessionId: string) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        // Verify session exists.
        // Чтецу разрешаем войти в свою комнату до официального старта (isLive=false),
        // чтобы он гарантированно получил session_started при WS-реконнекте.
        // Слушателям по-прежнему нужен активный эфир.
        const session = await storage.getReadingSession(sessionId);
        if (!session) {
          socket.emit("error", { message: "Session not found or not active" });
          return;
        }
        const isReader = session.readerId === socket.userId;
        if (!isReader && session.isLive !== true) {
          socket.emit("error", { message: "Session not found or not active" });
          return;
        }

        // Join the session as a listener (only for actual listeners, not the reader)
        if (!isReader) {
          await storage.joinSession(sessionId, socket.userId);
        }
        
        // Join socket room
        await socket.join(`session_${sessionId}`);
        socket.currentSession = sessionId;

        // Notify others in the session
        const listenerUpdate: ListenerUpdate = {
          sessionId,
          userId: socket.userId,
          action: 'join',
          timestamp: new Date().toISOString()
        };

        socket.to(`session_${sessionId}`).emit("listener_update", listenerUpdate);
        
        // Send current session state to the new listener
        const listenerCount = await storage.getActiveListenersCount(sessionId);
        socket.emit("session_joined", {
          sessionId,
          currentChapter: session.currentChapter,
          currentPosition: session.currentPosition,
          listenerCount,
          isLive: session.isLive ?? false,
          isPaused: false,
        });

        // Если чтец реконнектится к уже активной сессии — дублируем session_started
        if (session.isLive && socket.userId === session.readerId) {
          socket.emit("session_started", { sessionId });
        }

        logger.info(`User ${socket.userId} joined session ${sessionId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "Error joining session");
        socket.emit("error", { message: "Failed to join session" });
      }
    });

    // Leave current session
    socket.on("leave_session", async () => {
      if (socket.currentSession && socket.userId) {
        await leaveCurrentSession(socket);
      }
    });

    // Reader starts a session
    socket.on("start_session", async (data: { bookId: string; chapterNumber: number; clubId: string }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        // Create new reading session
        const session = await storage.createReadingSession({
          readerId: socket.userId,
          clubId: data.clubId,
          bookId: data.bookId,
          currentChapter: data.chapterNumber,
          currentPosition: "0",
          title: `Reading Session - Chapter ${data.chapterNumber}`
        });

        await socket.join(`session_${session.id}`);
        socket.currentSession = session.id;

        socket.emit("session_started", {
          sessionId: session.id,
          bookId: data.bookId,
          currentChapter: data.chapterNumber
        });

        logger.info(`User ${socket.userId} started session ${session.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "Error starting session");
        socket.emit("error", { message: "Failed to start session" });
      }
    });

    // Reader updates position in session
    socket.on("position_update", async (data: SessionPositionUpdate) => {
      try {
        if (!socket.userId || !socket.currentSession) {
          socket.emit("error", { message: "No active session" });
          return;
        }

        // Update session position
        await storage.updateSessionPosition(
          socket.currentSession,
          data.currentChapter,
          data.currentPosition
        );

        // Broadcast to all listeners in the session
        socket.to(`session_${socket.currentSession}`).emit("position_update", {
          sessionId: socket.currentSession,
          currentChapter: data.currentChapter,
          currentPosition: data.currentPosition,
          timestamp: new Date().toISOString()
        });

        logger.info(`Position updated in session ${socket.currentSession}: Chapter ${data.currentChapter}, Position ${data.currentPosition}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "Error updating position");
        socket.emit("error", { message: "Failed to update position" });
      }
    });

    // End session
    socket.on("end_session", async () => {
      try {
        if (!socket.userId || !socket.currentSession) {
          socket.emit("error", { message: "No active session" });
          return;
        }

        // Mark session as ended
        await storage.endSession(socket.currentSession);
        
        // Notify all listeners
        socket.to(`session_${socket.currentSession}`).emit("session_ended", {
          sessionId: socket.currentSession,
          endedBy: socket.userId,
          timestamp: new Date().toISOString()
        });

        logger.info(`Session ${socket.currentSession} ended by ${socket.userId}`);
        socket.currentSession = undefined;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "Error ending session");
        socket.emit("error", { message: "Failed to end session" });
      }
    });

    // Rate reader after session
    socket.on("rate_reader", async (data: { sessionId: string; readerId: string; rating: number }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        if (data.rating < 1 || data.rating > 5) {
          socket.emit("error", { message: "Rating must be between 1 and 5" });
          return;
        }

        // Save rating
        await storage.rateReader({
          sessionId: data.sessionId,
          readerId: data.readerId,
          raterId: socket.userId,
          rating: data.rating
        });

        // Rating calculation handled internally by storage

        // Notify the reader about the new rating
        socket.emit("rating_submitted", { 
          sessionId: data.sessionId,
          rating: data.rating 
        });

        logger.info(`User ${socket.userId} rated reader ${data.readerId}: ${data.rating} stars`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "Error submitting rating");
        socket.emit("error", { message: "Failed to submit rating" });
      }
    });

    // Handle disconnect
    // ========== AUDIO STREAMING HANDLERS ==========
    
    // Чтец начинает аудио-сессию
    socket.on("audio:start_session", async (data: { sessionId: string; clubId: string; bookId: string; config?: AudioSessionConfig }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        const { sessionId, clubId, bookId, config } = data;
        
        // Проверяем права чтеца
        const session = await storage.getReadingSession(sessionId);
        if (session?.readerId !== socket.userId) {
          socket.emit("error", { message: "Not authorized to start audio session" });
          return;
        }

        // Создаем аудио-сессию
        audioBroadcaster.startSession(sessionId, clubId, socket.userId, bookId, config);
        
        // Присоединяем чтеца к комнате
        await socket.join(sessionId);
        
        socket.emit("audio:session_started", { sessionId });
        logger.info(`Audio session started by reader ${socket.userId}: ${sessionId}`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "Error starting audio session");
        socket.emit("error", { message: "Failed to start audio session" });
      }
    });

    // Слушатель присоединяется к аудио-сессии
    socket.on("audio:join_session", async (sessionId: string) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        // Проверяем существование сессии
        const audioSession = audioBroadcaster.getSession(sessionId);
        if (!audioSession?.isActive) {
          socket.emit("error", { message: "Audio session not found or inactive" });
          return;
        }

        // Добавляем слушателя
        const success = audioBroadcaster.addListener(sessionId, socket.id);
        if (!success) {
          socket.emit("error", { message: "Failed to join audio session" });
          return;
        }

        // Присоединяем к комнате
        await socket.join(sessionId);
        
        const stats = audioBroadcaster.getSessionStats(sessionId);
        socket.emit("audio:session_joined", { 
          sessionId, 
          listenerCount: stats?.listenerCount || 0 
        });
        
        logger.info(`User ${socket.userId} joined audio session: ${sessionId}`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "Error joining audio session");
        socket.emit("error", { message: "Failed to join audio session" });
      }
    });

    // Чтец отправляет аудио-chunk
    socket.on("audio:chunk", async (chunkData: { sessionId: string; data: Buffer; timestamp: number; sequence: number }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        const { sessionId, data, timestamp, sequence } = chunkData;
        
        // Проверяем права чтеца
        if (!audioBroadcaster.isReader(sessionId, socket.userId)) {
          socket.emit("error", { message: "Not authorized to send audio" });
          return;
        }

        const chunk: AudioChunk = {
          sessionId,
          data,
          timestamp,
          sequence
        };

        // Broadcast chunk всем слушателям
        audioBroadcaster.broadcastChunk(io, chunk);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "Error broadcasting audio chunk");
      }
    });

    // Завершение аудио-сессии
    socket.on("audio:end_session", async (sessionId: string) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        // Проверяем права чтеца
        if (!audioBroadcaster.isReader(sessionId, socket.userId)) {
          socket.emit("error", { message: "Not authorized to end audio session" });
          return;
        }

        // Завершаем сессию
        audioBroadcaster.endSession(sessionId);
        
        // Уведомляем всех в комнате
        io.to(sessionId).emit("audio:session_ended", { sessionId });
        
        socket.emit("audio:session_ended", { sessionId });
        logger.info(`Audio session ended by reader ${socket.userId}: ${sessionId}`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "Error ending audio session");
        socket.emit("error", { message: "Failed to end audio session" });
      }
    });

    socket.on("disconnect", async (reason) => {
      logger.info(`User ${socket.userId} disconnected: ${reason}`);
      
      // Удаляем из всех аудио-сессий
      const activeSessions = audioBroadcaster.getActiveSessions();
      for (const session of activeSessions) {
        if (audioBroadcaster.isListener(session.id, socket.id)) {
          audioBroadcaster.removeListener(session.id, socket.id);
        }
        // Если это чтец, завершаем сессию
        if (session.readerId === socket.userId) {
          audioBroadcaster.endSession(session.id);
          io.to(session.id).emit("audio:session_ended", { sessionId: session.id, reason: "reader_disconnected" });
        }
      }
      
      if (socket.currentSession && socket.userId) {
        await leaveCurrentSession(socket);
      }
    });
  });


  return io;
}
