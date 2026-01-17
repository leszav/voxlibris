import { Server as SocketIOServer, Socket } from "socket.io";
import { storage } from "./storage";
import type { 
  WebSocketMessage, 
  SessionPositionUpdate, 
  ListenerUpdate 
} from "@shared/schema";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  currentSession?: string;
}

export function setupWebSocketHandlers(io: SocketIOServer) {
  // Authentication middleware for WebSocket connections
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      // Use session-based authentication for WebSocket
      const userId = socket.handshake.auth.userId;
      console.log('WebSocket auth attempt for userId:', userId);
      
      if (!userId) {
        console.error('WebSocket auth failed: No userId provided');
        return next(new Error("Authentication required"));
      }

      // Verify user exists in database
      const user = await storage.getUser(userId);
      if (!user) {
        console.error('WebSocket auth failed: User not found:', userId);
        return next(new Error("User not found"));
      }

      socket.userId = userId;
      console.log('WebSocket authenticated for user:', userId);
      next();
    } catch (error) {
      console.error('WebSocket authentication error:', error);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`User ${socket.userId} connected to WebSocket`);

    // Join a reading session room
    socket.on("join_session", async (sessionId: string) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        // Verify session exists and is active
        const session = await storage.getReadingSession(sessionId);
        if (!session || !session.isLive) {
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

        console.log(`User ${socket.userId} joined session ${sessionId}`);
      } catch (error) {
        console.error("Error joining session:", error);
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
    socket.on("start_reading", async (sessionId: string) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        const session = await storage.getReadingSession(sessionId);
        if (!session || session.readerId !== socket.userId) {
          socket.emit("error", { message: "Unauthorized to start this session" });
          return;
        }

        // Start the session
        await storage.startSession(sessionId);
        
        // Join the session room as reader
        await socket.join(`session_${sessionId}`);
        socket.currentSession = sessionId;

        // Notify all listeners that reading has started
        io.to(`session_${sessionId}`).emit("session_started", {
          sessionId,
          readerId: socket.userId,
          timestamp: new Date().toISOString()
        });

        console.log(`Reader ${socket.userId} started session ${sessionId}`);
      } catch (error) {
        console.error("Error starting session:", error);
        socket.emit("error", { message: "Failed to start session" });
      }
    });

    // Reader updates position (chapter/page)
    socket.on("update_position", async (data: SessionPositionUpdate) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        const session = await storage.getReadingSession(data.sessionId);
        if (!session || session.readerId !== socket.userId) {
          socket.emit("error", { message: "Unauthorized to update position" });
          return;
        }

        // Update session position in database
        await storage.updateSessionPosition(
          data.sessionId,
          data.currentChapter,
          data.currentPosition
        );

        // Broadcast position update to all listeners
        socket.to(`session_${data.sessionId}`).emit("position_update", data);

        console.log(`Position updated for session ${data.sessionId}: Chapter ${data.currentChapter}`);
      } catch (error) {
        console.error("Error updating position:", error);
        socket.emit("error", { message: "Failed to update position" });
      }
    });

    // Reader ends session
    socket.on("end_reading", async (sessionId: string) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        const session = await storage.getReadingSession(sessionId);
        if (!session || session.readerId !== socket.userId) {
          socket.emit("error", { message: "Unauthorized to end this session" });
          return;
        }

        // End the session
        await storage.endSession(sessionId);

        // Notify all listeners that reading has ended
        io.to(`session_${sessionId}`).emit("session_ended", {
          sessionId,
          readerId: socket.userId,
          timestamp: new Date().toISOString()
        });

        console.log(`Reader ${socket.userId} ended session ${sessionId}`);
      } catch (error) {
        console.error("Error ending session:", error);
        socket.emit("error", { message: "Failed to end session" });
      }
    });

    // Rate a reader
    socket.on("rate_reader", async (data: { sessionId: string; readerId: string; rating: number; feedback?: string }) => {
      try {
        if (!socket.userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        // Verify user is/was a listener in this session
        const session = await storage.getReadingSession(data.sessionId);
        if (!session) {
          socket.emit("error", { message: "Session not found" });
          return;
        }

        // Save rating
        await storage.rateReader({
          sessionId: data.sessionId,
          readerId: data.readerId,
          raterId: socket.userId,
          rating: data.rating,
          feedback: data.feedback
        });

        // Calculate new average rating
        const averageRating = await storage.getReaderAverageRating(data.readerId);

        // Notify the reader about the new rating
        socket.emit("rating_submitted", { 
          sessionId: data.sessionId,
          rating: data.rating 
        });

        console.log(`User ${socket.userId} rated reader ${data.readerId}: ${data.rating} stars`);
      } catch (error) {
        console.error("Error rating reader:", error);
        socket.emit("error", { message: "Failed to submit rating" });
      }
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log(`User ${socket.userId} disconnected`);
      
      if (socket.currentSession && socket.userId) {
        await leaveCurrentSession(socket);
      }
    });

    // Helper function to leave current session
    async function leaveCurrentSession(socket: AuthenticatedSocket) {
      const sessionId = socket.currentSession!;
      const userId = socket.userId!;

      try {
        // Leave session in database
        await storage.leaveSession(sessionId, userId);
        
        // Leave socket room
        await socket.leave(`session_${sessionId}`);

        // Notify others in the session
        const listenerUpdate: ListenerUpdate = {
          sessionId,
          userId,
          action: 'leave',
          timestamp: new Date().toISOString()
        };

        socket.to(`session_${sessionId}`).emit("listener_update", listenerUpdate);

        socket.currentSession = undefined;
        console.log(`User ${userId} left session ${sessionId}`);
      } catch (error) {
        console.error("Error leaving session:", error);
      }
    }
  });

  return io;
}