import { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { inArray } from "drizzle-orm";
import { db, eq, and, desc } from "./db.js";
import {
  users,
  clubs,
  clubMembers,
  chatMessages,
  type ChatMessage,
  type ChatMessageWithUser,
} from "../shared/schema.js";

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
  attachments?: any[]; // arbitrary attachment descriptors
}

interface LoadHistoryPayload {
  clubId: string;
  channel?: string;
  offset?: number;
  limit?: number;
}

const DEFAULT_CHANNEL = "general";
const MAX_MESSAGES_PER_CLUB = 1000;

async function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  try {
    const token =
      (socket.handshake.auth && (socket.handshake.auth as any).token) ||
      socket.handshake.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return next(new Error("JWT_SECRET not configured"));
    }

    const decoded = jwt.verify(token, secret) as JwtPayload & {
      userId: string;
      username: string;
    };

    if (!decoded.userId || !decoded.username) {
      return next(new Error("Invalid token payload"));
    }

    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    if (!user || user.status !== "active") {
      return next(new Error("User not found or inactive"));
    }

    (socket as AuthenticatedSocket).userId = decoded.userId;
    (socket as AuthenticatedSocket).username = decoded.username;

    next();
  } catch (error) {
    console.error("[WS Chat] Authentication error:", error);
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
    console.error("[WS Chat] verifyClubAccess error:", error);
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

function addParticipant(room: string, userId: string, username: string) {
  let map = roomParticipants.get(room);
  if (!map) {
    map = new Map();
    roomParticipants.set(room, map);
  }
  map.set(userId, { userId, username });
}

function removeParticipant(room: string, userId: string) {
  const map = roomParticipants.get(room);
  if (!map) return;
  map.delete(userId);
  if (map.size === 0) {
    roomParticipants.delete(room);
  }
}

function getParticipants(room: string): Array<{ userId: string; username: string }> {
  const map = roomParticipants.get(room);
  return map ? Array.from(map.values()) : [];
}

export function initializeChatWebSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
    path: "/ws/chat",
  });

  io.use(authenticateSocket);

  io.on("connection", (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    console.log(`[WS Chat] User ${authSocket.username} (${authSocket.userId}) connected`);

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
        addParticipant(room, authSocket.userId, authSocket.username);

        console.log(`[WS Chat] ${authSocket.username} joined room ${room}`);

        io.to(room).emit("participants", {
          room,
          clubId,
          channel: channel || DEFAULT_CHANNEL,
          participants: getParticipants(room),
        });

        socket.emit("joined_room", { room, clubId, channel: channel || DEFAULT_CHANNEL });
      } catch (error) {
        console.error("[WS Chat] join_room error:", error);
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

        // Ограничиваем историю до MAX_MESSAGES_PER_CLUB на уровне комнаты (clubId + channel)
        try {
          const oldMessages = await db
            .select({ id: chatMessages.id })
            .from(chatMessages)
            .where(
              and(
                eq(chatMessages.clubId, clubId),
                eq(chatMessages.channel, channel || DEFAULT_CHANNEL),
              ),
            )
            .orderBy(desc(chatMessages.createdAt))
            .offset(MAX_MESSAGES_PER_CLUB)
            .limit(1000);

          const oldIds = oldMessages.map((m: { id: string }) => m.id);
          if (oldIds.length > 0) {
            await db.delete(chatMessages).where(inArray(chatMessages.id, oldIds));
          }
        } catch (cleanupError) {
          console.error("[WS Chat] history cleanup error:", cleanupError);
        }

        const messageWithUser: ChatMessageWithUser = {
          ...(inserted as ChatMessage),
          user: {
            id: authSocket.userId,
            username: authSocket.username,
          } as any,
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
        console.error("[WS Chat] chat_message error:", error);
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
          })
          .from(chatMessages)
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
        }) => ({
          ...(row as any as ChatMessage),
          user: { id: row.userId } as any,
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
        console.error("[WS Chat] load_history error:", error);
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
          console.error("[WS Chat] delete_message error:", error);
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

      io.to(room).emit("participants", {
        room,
        clubId,
        channel: channel || DEFAULT_CHANNEL,
        participants: getParticipants(room),
      });

      console.log(`[WS Chat] ${authSocket.username} left room ${room}`);
    });

    socket.on("disconnect", () => {
      console.log(`[WS Chat] User ${authSocket.username} (${authSocket.userId}) disconnected`);
      // Очистка участника из всех комнат
      for (const [room, participants] of roomParticipants.entries()) {
        if (participants.has(authSocket.userId)) {
          participants.delete(authSocket.userId);
          io.to(room).emit("participants", {
            room,
            participants: Array.from(participants.values()),
          });
        }
      }
    });
  });

  console.log("[WS Chat] WebSocket server initialized at /ws/chat");
  return io;
}