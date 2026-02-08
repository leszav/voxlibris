import { Server as SocketIOServer, Socket } from "socket.io";
import { storage } from "./repositories/index.js";
import { WebRTCHandler } from "./webrtc/webrtc-handler.js";
import { MediasoupManager } from "./webrtc/mediasoup-manager.js";
import { logger } from "./lib/logger.js";
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
  // Инициализация mediasoup
  const mediasoupManager = MediasoupManager.getInstance();
  mediasoupManager.initialize().catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Failed to initialize mediasoup');
  });

  // Создаем обработчик WebRTC
  const webrtcHandler = new WebRTCHandler();
  // Authentication middleware for WebSocket connections
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      // Use session-based authentication for WebSocket
      const userId = socket.handshake.auth.userId;
      logger.info({ userId }, 'WebSocket auth attempt');
      
      if (!userId) {
        logger.error('WebSocket auth failed: No userId provided');
        return next(new Error("Authentication required"));
      }

      // Verify user exists in database
      const user = await storage.getUser(userId);
      if (!user) {
        logger.error({ userId }, 'WebSocket auth failed: User not found');
        return next(new Error("User not found"));
      }

      socket.userId = userId;
      logger.info({ userId }, 'WebSocket authenticated');
      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'WebSocket authentication error');
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    logger.info(`User ${socket.userId} connected to WebSocket`);

    // Настраиваем обработчики WebRTC
    webrtcHandler.setupHandlers(socket);

    // Join a reading session room
    socket.on("join_session", async (sessionId: string) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        // Verify session exists and is active
        const session = await storage.getReadingSession(sessionId);
        if (session?.isLive !== true) {
          socket.emit("error", { message: "Session not found or not active" });
          return;
        }

        // Join the session as a listener
        await storage.joinSession(sessionId, socket.userId);
        
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
          listenerCount
        });

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
    socket.on("disconnect", async (reason) => {
      logger.info(`User ${socket.userId} disconnected: ${reason}`);
      
      // Обрабатываем WebRTC отключение
      await webrtcHandler.handleDisconnect(socket);

      if (socket.currentSession && socket.userId) {
        await leaveCurrentSession(socket);
      }
    });
  });


  return io;
}
