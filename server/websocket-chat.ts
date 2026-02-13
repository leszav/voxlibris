import { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { sql } from "drizzle-orm";
import { db, eq, and, desc } from "./db.js";
import {
  users,
  userProfiles,
  clubs,
  clubMembers,
  chatMessages,
  type ChatMessage,
  type ChatUser,
  type ChatMessageWithUser,
} from "../shared/schema.js";
import { logger } from "./lib/logger.js";

interface AuthenticatedSocket extends Socket {
  userId: string;
  username: string;
}

interface JoinRoomPayload {
  clubId: string;
  channel?: string; // logical channel inside club ("general", "voice", etc.)
}

interface ChatMessagePayload {
  clubId: string;
  channel?: string;
  text: string;
  mentions?: string[]; // user ids
  attachments?: Array<Record<string, unknown>>; // arbitrary attachment descriptors
}

interface LoadHistoryPayload {
  clubId: string;
  channel?: string;
  offset?: number;
  limit?: number;
}

const DEFAULT_CHANNEL = "general";
const MAX_MESSAGES_PER_CLUB = 1000;
const CHAT_HISTORY_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const CHAT_HISTORY_CLEANUP_BATCH_SIZE = 5000;
const MAX_TRACKED_CHAT_ROOMS = 2000;
const MAX_PARTICIPANTS_PER_ROOM = 1000;

async function cleanupChatHistory(): Promise<void> {
  try {
    await db.execute(sql`
      WITH ranked_messages AS (
        SELECT
          ${chatMessages.id} AS id,
          ROW_NUMBER() OVER (
            PARTITION BY ${chatMessages.clubId}, ${chatMessages.channel}
            ORDER BY ${chatMessages.createdAt} DESC
          ) AS row_num
        FROM ${chatMessages}
      ),
      to_delete AS (
        SELECT id
        FROM ranked_messages
        WHERE row_num > ${MAX_MESSAGES_PER_CLUB}
        LIMIT ${CHAT_HISTORY_CLEANUP_BATCH_SIZE}
      )
      DELETE FROM ${chatMessages}
      WHERE ${chatMessages.id} IN (SELECT id FROM to_delete)
    `);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[WS Chat] history cleanup error");
  }
}

async function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  try {
    const auth = socket.handshake.auth as Record<string, unknown> | undefined;
    const authToken = typeof auth?.token === "string" ? auth.token : undefined;
    const token =
      authToken ||
      socket.handshake.headers.authorization?.replace("Bearer ", "") ||
      socket.handshake.headers.cookie?.match(/accessToken=([^;]+)/)?.[1];

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    // Используем ту же логику аутентификации, что и основная платформа
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return next(new Error("JWT_SECRET not configured"));
    }

    // Проверяем токен и получаем payload
    const decoded = jwt.verify(token, secret) as JwtPayload & {
      userId: string;
      username: string;
      role: string;
      status?: string;
      iat?: number;
      exp?: number;
    };

    if (!decoded.userId || !decoded.username) {
      return next(new Error("Invalid token payload"));
    }

    // Проверяем срок действия токена
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      return next(new Error("Token expired"));
    }

    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    if (!user || user.status !== "active" || !user.emailConfirmed) {
      return next(new Error("User not found, inactive, or not confirmed"));
    }

    (socket as AuthenticatedSocket).userId = decoded.userId;
    (socket as AuthenticatedSocket).username = decoded.username;

    logger.info(`[WS Chat] User ${decoded.username} (${decoded.userId}) authenticated successfully`);
    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[WS Chat] Authentication error");
    
    if (error instanceof jwt.TokenExpiredError) {
      return next(new Error("Token expired - please re-authenticate"));
    }
    
    next(new Error("Authentication failed"));
  }
}

async function verifyClubAccess(userId: string, clubId: string): Promise<boolean> {
  try {
    const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
    if (!club || !club.isActive) return false;

    const [membership] = await db
      .select()
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.clubId, clubId),
          eq(clubMembers.userId, userId),
          eq(clubMembers.isActive, true),
        ),
      )
      .limit(1);

    return !!membership;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[WS Chat] verifyClubAccess error");
    return false;
  }
}

function buildRoomName(clubId: string, channel?: string): string {
  const ch = channel?.trim() || DEFAULT_CHANNEL;
  return `${clubId}:${ch}`;
}

// In-memory tracking of participants per room
// roomName -> Map<userId, { userId, username }>
const roomParticipants = new Map<string, Map<string, { userId: string; username: string }>>();
const roomTouchedAt = new Map<string, number>();

function markRoomTouched(room: string): void {
  roomTouchedAt.set(room, Date.now());
}

function evictOldestRoomsIfNeeded(): void {
  if (roomParticipants.size < MAX_TRACKED_CHAT_ROOMS) {
    return;
  }

  const roomsByAge = Array.from(roomTouchedAt.entries()).sort((a, b) => a[1] - b[1]);
  const overflow = roomParticipants.size - MAX_TRACKED_CHAT_ROOMS + 1;
  for (const [room] of roomsByAge.slice(0, overflow)) {
    roomParticipants.delete(room);
    roomTouchedAt.delete(room);
  }
}

function addParticipant(room: string, userId: string, username: string): boolean {
  let map = roomParticipants.get(room);
  if (!map) {
    evictOldestRoomsIfNeeded();
    map = new Map();
    roomParticipants.set(room, map);
  }
  if (!map.has(userId) && map.size >= MAX_PARTICIPANTS_PER_ROOM) {
    return false;
  }
  map.set(userId, { userId, username });
  markRoomTouched(room);
  return true;
}

function removeParticipant(room: string, userId: string) {
  const map = roomParticipants.get(room);
  if (!map) return;
  map.delete(userId);
  markRoomTouched(room);
  if (map.size === 0) {
    roomParticipants.delete(room);
    roomTouchedAt.delete(room);
  }
}

function getParticipants(room: string): Array<{ userId: string; username: string }> {
  const map = roomParticipants.get(room);
  if (map) {
    markRoomTouched(room);
  }
  return map ? Array.from(map.values()) : [];
}

export function initializeChatWebSocket(httpServer: HttpServer) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:5173", "http://localhost:3000"];

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    path: "/ws/chat",
    transports: ["websocket", "polling"],
  });

  io.use(authenticateSocket);

  const historyCleanupInterval = setInterval(() => {
    void cleanupChatHistory();
  }, CHAT_HISTORY_CLEANUP_INTERVAL_MS);
  historyCleanupInterval.unref();

  io.on("connection", (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    logger.info(`[WS Chat] User ${authSocket.username} (${authSocket.userId}) connected`);

    socket.on("join_room", async (payload: JoinRoomPayload) => {
      try {
        const { clubId, channel } = payload;
        if (!clubId) {
          socket.emit("error", { message: "clubId is required" });
          return;
        }

        const hasAccess = await verifyClubAccess(authSocket.userId, clubId);
        if (!hasAccess) {
          socket.emit("error", { message: "Access denied to this club" });
          return;
        }

        const room = buildRoomName(clubId, channel);
        await socket.join(room);
        const added = addParticipant(room, authSocket.userId, authSocket.username);
        if (!added) {
          await socket.leave(room);
          socket.emit("error", { message: "Room is at participant capacity" });
          return;
        }

        logger.info(`[WS Chat] ${authSocket.username} joined room ${room}`);

        io.to(room).emit("participants", {
          room,
          clubId,
          channel: channel || DEFAULT_CHANNEL,
          participants: getParticipants(room),
        });

        socket.emit("joined_room", { room, clubId, channel: channel || DEFAULT_CHANNEL });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "[WS Chat] join_room error");
        socket.emit("error", { message: "Failed to join room" });
      }
    });

    socket.on("chat_message", async (payload: ChatMessagePayload) => {
      try {
        const { clubId, channel, text, mentions, attachments } = payload;
        if (!clubId || !text?.trim()) {
          socket.emit("error", { message: "clubId and text are required" });
          return;
        }

        const hasAccess = await verifyClubAccess(authSocket.userId, clubId);
        if (!hasAccess) {
          socket.emit("error", { message: "Access denied to this club" });
          return;
        }

        const room = buildRoomName(clubId, channel);

        const [inserted] = await db
          .insert(chatMessages)
          .values({
            clubId,
            channel: channel || DEFAULT_CHANNEL,
            userId: authSocket.userId,
            text: text.trim(),
            mentions: mentions && mentions.length > 0 ? JSON.stringify(mentions) : null,
            attachments: attachments && attachments.length > 0 ? JSON.stringify(attachments) : null,
          })
          .returning();

        // Получаем displayName из профиля пользователя
        const userProfile = await db
          .select({ displayName: userProfiles.displayName })
          .from(userProfiles)
          .where(eq(userProfiles.userId, authSocket.userId))
          .limit(1);

        const messageWithUser: ChatMessageWithUser = {
          ...(inserted as ChatMessage),
          user: {
            id: authSocket.userId,
            username: authSocket.username,
            displayName: userProfile[0]?.displayName || null,
          } as ChatUser,
        };

        io.to(room).emit("chat_message", {
          room,
          clubId,
          channel: channel || DEFAULT_CHANNEL,
          message: messageWithUser,
        });

        // Ack для отправителя
        socket.emit("message_sent", {
          room,
          clubId,
          channel: channel || DEFAULT_CHANNEL,
          message: messageWithUser,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "[WS Chat] chat_message error");
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("load_history", async (payload: LoadHistoryPayload) => {
      try {
        const { clubId, channel, offset = 0, limit = 50 } = payload;
        if (!clubId) {
          socket.emit("error", { message: "clubId is required" });
          return;
        }

        const hasAccess = await verifyClubAccess(authSocket.userId, clubId);
        if (!hasAccess) {
          socket.emit("error", { message: "Access denied to this club" });
          return;
        }

        const room = buildRoomName(clubId, channel);

        const rows = await db
          .select({
            id: chatMessages.id,
            clubId: chatMessages.clubId,
            channel: chatMessages.channel,
            userId: chatMessages.userId,
            text: chatMessages.text,
            mentions: chatMessages.mentions,
            attachments: chatMessages.attachments,
            createdAt: chatMessages.createdAt,
            updatedAt: chatMessages.updatedAt,
            deletedAt: chatMessages.deletedAt,
            username: users.username,
            displayName: userProfiles.displayName,
          })
          .from(chatMessages)
          .innerJoin(users, eq(chatMessages.userId, users.id))
          .leftJoin(userProfiles, eq(chatMessages.userId, userProfiles.userId))
          .where(
            and(
              eq(chatMessages.clubId, clubId),
              eq(chatMessages.channel, channel || DEFAULT_CHANNEL),
            ),
          )
          .orderBy(desc(chatMessages.createdAt))
          .offset(offset)
          .limit(Math.min(limit, 100));

        const messages: ChatMessageWithUser[] = rows.map((row: {
          id: string;
          clubId: string;
          channel: string;
          userId: string;
          text: string;
          mentions: string | null;
          attachments: string | null;
          createdAt: Date;
          updatedAt: Date;
          deletedAt: Date | null;
          username: string;
          displayName: string | null;
        }) => ({
          ...((
            ({ username: _username, displayName: _displayName, ...rest }) => rest
          )(row) as ChatMessage),
          user: { 
            id: row.userId,
            username: row.username,
            displayName: row.displayName,
          } as ChatUser,
        }));

        socket.emit("history", {
          room,
          clubId,
          channel: channel || DEFAULT_CHANNEL,
          offset,
          limit,
          messages,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "[WS Chat] load_history error");
        socket.emit("error", { message: "Failed to load history" });
      }
    });

    socket.on("get_participants", (payload: JoinRoomPayload) => {
      const { clubId, channel } = payload;
      if (!clubId) return;
      const room = buildRoomName(clubId, channel);
      socket.emit("participants", {
        room,
        clubId,
        channel: channel || DEFAULT_CHANNEL,
        participants: getParticipants(room),
      });
    });

    // Удаление сообщения (только владелец клуба или автор, можно расширить под модераторов)
    socket.on(
      "delete_message",
      async (payload: { messageId: string; clubId: string; channel?: string }) => {
        try {
          const { messageId, clubId, channel } = payload;
          if (!messageId || !clubId) {
            socket.emit("error", { message: "messageId and clubId are required" });
            return;
          }

          const hasAccess = await verifyClubAccess(authSocket.userId, clubId);
          if (!hasAccess) {
            socket.emit("error", { message: "Access denied to this club" });
            return;
          }

          const room = buildRoomName(clubId, channel);

          // Получаем участника и его роль
          const [member] = await db
            .select({ role: clubMembers.role })
            .from(clubMembers)
            .where(
              and(
                eq(clubMembers.clubId, clubId),
                eq(clubMembers.userId, authSocket.userId),
                eq(clubMembers.isActive, true),
              ),
            )
            .limit(1);

          // Получаем сообщение
          const [message] = await db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.id, messageId))
            .limit(1);

          if (!message || message.clubId !== clubId) {
            socket.emit("error", { message: "Message not found" });
            return;
          }

          const isOwner = member?.role === "owner";
          const isAuthor = message.userId === authSocket.userId;

          if (!isOwner && !isAuthor) {
            socket.emit("error", { message: "Not allowed to delete this message" });
            return;
          }

          await db
            .update(chatMessages)
            .set({
              text: "[deleted]",
              deletedAt: new Date(),
            })
            .where(eq(chatMessages.id, messageId));

          io.to(room).emit("message_deleted", {
            room,
            clubId,
            channel: channel || DEFAULT_CHANNEL,
            messageId,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error({ error: errorMessage }, "[WS Chat] delete_message error");
          socket.emit("error", { message: "Failed to delete message" });
        }
      },
    );

    socket.on("leave_room", (payload: JoinRoomPayload) => {
      const { clubId, channel } = payload;
      if (!clubId) return;
      const room = buildRoomName(clubId, channel);
      socket.leave(room);
      removeParticipant(room, authSocket.userId);
      const participants = getParticipants(room);

      io.to(room).emit("participants", {
        room,
        clubId,
        channel: channel || DEFAULT_CHANNEL,
        participants,
      });

      logger.info(`[WS Chat] ${authSocket.username} left room ${room}`);
    });

    socket.on("disconnect", () => {
      logger.info(`[WS Chat] User ${authSocket.username} (${authSocket.userId}) disconnected`);
      // Очистка участника из всех комнат
      for (const [room, participants] of roomParticipants.entries()) {
        if (participants.has(authSocket.userId)) {
          participants.delete(authSocket.userId);

          if (participants.size === 0) {
            roomParticipants.delete(room);
            roomTouchedAt.delete(room);
            continue;
          }

          io.to(room).emit("participants", {
            room,
            participants: Array.from(participants.values()),
          });
        }
      }
    });
  });

  logger.info("[WS Chat] WebSocket server initialized at /ws/chat");

  httpServer.once("close", () => {
    clearInterval(historyCleanupInterval);
  });

  return io;
}
