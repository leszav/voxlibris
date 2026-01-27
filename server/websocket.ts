import { Server as SocketIOServer, Socket } from "socket.io";
import { storage } from "./storage.js";
import type { 
  SessionPositionUpdate, 
  ListenerUpdate 
} from "../shared/schema.js";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  currentSession?: string;
}

// WebSocket connection tracking for security
const userConnections = new Map<string, Set<string>>();
const MAX_CONNECTIONS_PER_USER = 5;
const MAX_TOTAL_CONNECTIONS = 1000;

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
    
    console.log(`User ${socket.userId} left session ${socket.currentSession}`);
    socket.currentSession = undefined;
  } catch (error) {
    console.error("Error leaving session:", error);
  }
}

export function setupWebSocketHandlers(io: SocketIOServer) {
  // Authentication middleware for WebSocket connections with connection limits
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      // Check total connection limit
      const totalConnections = io.sockets.sockets.size;
      if (totalConnections >= MAX_TOTAL_CONNECTIONS) {
        console.warn('WebSocket connection limit reached:', totalConnections);
        return next(new Error("Server connection limit reached"));
      }

      // Use session-based authentication for WebSocket
      const userId = socket.handshake.auth.userId;
      console.log('WebSocket auth attempt for userId:', userId);
      
      if (!userId) {
        console.error('WebSocket auth failed: No userId provided');
        return next(new Error("Authentication required"));
      }

      // Check per-user connection limit
      const userConnectionCount = userConnections.get(userId)?.size || 0;
      if (userConnectionCount >= MAX_CONNECTIONS_PER_USER) {
        console.warn(`WebSocket user connection limit reached for ${userId}:`, userConnectionCount);
        return next(new Error("Too many connections"));
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

    // Track connection for security
    if (socket.userId) {
      const userSockets = userConnections.get(socket.userId) || new Set();
      userSockets.add(socket.id);
      userConnections.set(socket.userId, userSockets);
    }

    // Cleanup on disconnect
    socket.on("disconnect", () => {
      if (socket.userId) {
        const userSockets = userConnections.get(socket.userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            userConnections.delete(socket.userId);
          }
        }
      }
    });

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

        console.log(`User ${socket.userId} started session ${session.id}`);
      } catch (error) {
        console.error("Error starting session:", error);
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

        console.log(`Position updated in session ${socket.currentSession}: Chapter ${data.currentChapter}, Position ${data.currentPosition}`);
      } catch (error) {
        console.error("Error updating position:", error);
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

        console.log(`Session ${socket.currentSession} ended by ${socket.userId}`);
        socket.currentSession = undefined;
      } catch (error) {
        console.error("Error ending session:", error);
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

        console.log(`User ${socket.userId} rated reader ${data.readerId}: ${data.rating} stars`);
      } catch (error) {
        console.error("Error submitting rating:", error);
        socket.emit("error", { message: "Failed to submit rating" });
      }
    });

    // Handle disconnect
    socket.on("disconnect", async (reason) => {
      console.log(`User ${socket.userId} disconnected: ${reason}`);
      
      if (socket.currentSession && socket.userId) {
        await leaveCurrentSession(socket);
      }
    });
  });


  return io;
}