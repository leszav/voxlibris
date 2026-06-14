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
  notifications,
  type ChatMessage,
  type ChatMessageWithUser,
} from "../shared/schema.js";
import { logger } from "./lib/logger.js";
import { presenceService } from "./services/presence-service.js";

interface AuthenticatedUser {
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

interface DeleteMessagePayload {
  messageId: string;
  clubId: string;
  channel?: string;
}

interface ChatSocketContext {
  io: Server;
  socket: Socket;
  user: AuthenticatedUser;
}

type ChatHistoryRow = ChatMessage & {
  username: string;
  displayName: string | null;
  avatar: string | null;
};

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
    if ((decoded.exp ?? Number.POSITIVE_INFINITY) < now) {
      return next(new Error("Token expired"));
    }

    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    if (user?.status !== "active") {
      return next(new Error("User not found or inactive"));
    }

    if (user.emailConfirmed !== true) {
      await db
        .update(users)
        .set({ emailConfirmed: true, confirmationToken: null })
        .where(eq(users.id, user.id));
    }

    socket.data.userId = decoded.userId;
    socket.data.username = decoded.username;

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
    if (club?.isActive !== true) return false;

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

function toChatMessageWithUser(row: ChatHistoryRow): ChatMessageWithUser {
  const {
    username,
    displayName,
    avatar,
    id,
    clubId,
    channel,
    userId,
    text,
    mentions,
    attachments,
    createdAt,
    updatedAt,
    deletedAt,
  } = row;

  return {
    id,
    clubId,
    channel,
    userId,
    text,
    mentions,
    attachments,
    createdAt,
    updatedAt,
    deletedAt,
    user: {
      id: userId,
      username,
      displayName,
      avatar,
    },
  };
}

function resolveChannel(channel?: string): string {
  return channel || DEFAULT_CHANNEL;
}

function getAuthenticatedUser(socket: Socket): AuthenticatedUser {
  const { userId, username } = socket.data;
  if (typeof userId !== "string" || typeof username !== "string") {
    throw new TypeError("Socket is not authenticated");
  }

  return { userId, username };
}

function emitParticipants(
  io: Server,
  room: string,
  clubId: string,
  channel: string | undefined,
): void {
  io.to(room).emit("participants", {
    room,
    clubId,
    channel: resolveChannel(channel),
    participants: getParticipants(room),
  });
}

async function handleJoinRoom(
  { io, socket, user }: ChatSocketContext,
  payload: JoinRoomPayload,
): Promise<void> {
  try {
    const { clubId, channel } = payload;
    if (!clubId) {
      socket.emit("error", { message: "clubId is required" });
      return;
    }

    const hasAccess = await verifyClubAccess(user.userId, clubId);
    if (!hasAccess) {
      socket.emit("error", { message: "Access denied to this club" });
      return;
    }

    const room = buildRoomName(clubId, channel);
    await socket.join(room);
    const added = addParticipant(room, user.userId, user.username);
    if (!added) {
      await socket.leave(room);
      socket.emit("error", { message: "Room is at participant capacity" });
      return;
    }

    logger.info(`[WS Chat] ${user.username} joined room ${room}`);

    emitParticipants(io, room, clubId, channel);
    socket.emit("joined_room", { room, clubId, channel: resolveChannel(channel) });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[WS Chat] join_room error");
    socket.emit("error", { message: "Failed to join room" });
  }
}

async function handleChatMessage(
  { io, socket, user }: ChatSocketContext,
  payload: ChatMessagePayload,
): Promise<void> {
  try {
    const { clubId, channel, text: rawText, mentions, attachments } = payload;
    const text = typeof rawText === "string" ? rawText.trim() : "";
    if (!clubId || !text) {
      socket.emit("error", { message: "clubId and text are required" });
      return;
    }

    const hasAccess = await verifyClubAccess(user.userId, clubId);
    if (!hasAccess) {
      socket.emit("error", { message: "Access denied to this club" });
      return;
    }

    const room = buildRoomName(clubId, channel);
    const resolvedChannel = resolveChannel(channel);

    const [inserted] = await db
      .insert(chatMessages)
      .values({
        clubId,
        channel: resolvedChannel,
        userId: user.userId,
        text,
        mentions: mentions?.length ? JSON.stringify(mentions) : null,
        attachments: attachments?.length ? JSON.stringify(attachments) : null,
      })
      .returning();

    const userProfile = await db
      .select({ displayName: userProfiles.displayName, avatar: userProfiles.avatar })
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.userId))
      .limit(1);

    const messageWithUser: ChatMessageWithUser = {
      ...inserted,
      user: {
        id: user.userId,
        username: user.username,
        displayName: userProfile[0]?.displayName || null,
        avatar: userProfile[0]?.avatar || null,
      },
    };

    io.to(room).emit("chat_message", {
      room,
      clubId,
      channel: resolvedChannel,
      message: messageWithUser,
    });

    socket.emit("message_sent", {
      room,
      clubId,
      channel: resolvedChannel,
      message: messageWithUser,
    });

    // Создать notification для каждого упомянутого пользователя (не для себя)
    if (mentions && mentions.length > 0) {
      const uniqueMentions = [...new Set(mentions)].filter(uid => uid !== user.userId);
      if (uniqueMentions.length > 0) {
        await db.insert(notifications).values(
          uniqueMentions.map(mentionedUserId => ({
            userId: mentionedUserId,
            type: "mention" as const,
            sourceUserId: user.userId,
            sourceMessageId: inserted.id,
            message: `${user.username} упомянул вас в чате`,
          }))
        );
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[WS Chat] chat_message error");
    socket.emit("error", { message: "Failed to send message" });
  }
}

async function handleLoadHistory(
  { socket, user }: ChatSocketContext,
  payload: LoadHistoryPayload,
): Promise<void> {
  try {
    const { clubId, channel, offset = 0, limit = 50 } = payload;
    if (!clubId) {
      socket.emit("error", { message: "clubId is required" });
      return;
    }

    const hasAccess = await verifyClubAccess(user.userId, clubId);
    if (!hasAccess) {
      socket.emit("error", { message: "Access denied to this club" });
      return;
    }

    const room = buildRoomName(clubId, channel);
    const resolvedChannel = resolveChannel(channel);

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
        avatar: userProfiles.avatar,
      })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.userId, users.id))
      .leftJoin(userProfiles, eq(chatMessages.userId, userProfiles.userId))
      .where(
        and(
          eq(chatMessages.clubId, clubId),
          eq(chatMessages.channel, resolvedChannel),
        ),
      )
      .orderBy(desc(chatMessages.createdAt))
      .offset(offset)
      .limit(Math.min(limit, 100));

    socket.emit("history", {
      room,
      clubId,
      channel: resolvedChannel,
      offset,
      limit,
      messages: rows.map(toChatMessageWithUser),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[WS Chat] load_history error");
    socket.emit("error", { message: "Failed to load history" });
  }
}

function handleGetParticipants(socket: Socket, payload: JoinRoomPayload): void {
  const { clubId, channel } = payload;
  if (!clubId) {
    return;
  }

  const room = buildRoomName(clubId, channel);
  socket.emit("participants", {
    room,
    clubId,
    channel: resolveChannel(channel),
    participants: getParticipants(room),
  });
}

async function handleDeleteMessage(
  { io, socket, user }: ChatSocketContext,
  payload: DeleteMessagePayload,
): Promise<void> {
  try {
    const { messageId, clubId, channel } = payload;
    if (!messageId || !clubId) {
      socket.emit("error", { message: "messageId and clubId are required" });
      return;
    }

    const hasAccess = await verifyClubAccess(user.userId, clubId);
    if (!hasAccess) {
      socket.emit("error", { message: "Access denied to this club" });
      return;
    }

    const room = buildRoomName(clubId, channel);

    const [member] = await db
      .select({ role: clubMembers.role })
      .from(clubMembers)
      .where(
        and(
          eq(clubMembers.clubId, clubId),
          eq(clubMembers.userId, user.userId),
          eq(clubMembers.isActive, true),
        ),
      )
      .limit(1);

    const [message] = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1);

    if (message?.clubId !== clubId) {
      socket.emit("error", { message: "Message not found" });
      return;
    }

    const isOwner = member?.role === "owner";
    const isAuthor = message.userId === user.userId;

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
      channel: resolveChannel(channel),
      messageId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "[WS Chat] delete_message error");
    socket.emit("error", { message: "Failed to delete message" });
  }
}

function handleLeaveRoom({ io, socket, user }: ChatSocketContext, payload: JoinRoomPayload): void {
  const { clubId, channel } = payload;
  if (!clubId) {
    return;
  }

  const room = buildRoomName(clubId, channel);
  socket.leave(room);
  removeParticipant(room, user.userId);
  const participants = getParticipants(room);

  io.to(room).emit("participants", {
    room,
    clubId,
    channel: resolveChannel(channel),
    participants,
  });

  logger.info(`[WS Chat] ${user.username} left room ${room}`);
}

function handleDisconnect(io: Server, user: AuthenticatedUser): void {
  logger.info(`[WS Chat] User ${user.username} (${user.userId}) disconnected`);

  for (const [room, participants] of roomParticipants.entries()) {
    if (!participants.has(user.userId)) {
      continue;
    }

    participants.delete(user.userId);

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

function registerChatSocketHandlers(context: ChatSocketContext): void {
  const { socket } = context;

  socket.on("join_room", (payload: JoinRoomPayload) => {
    void handleJoinRoom(context, payload);
  });

  socket.on("chat_message", (payload: ChatMessagePayload) => {
    void handleChatMessage(context, payload);
  });

  socket.on("load_history", (payload: LoadHistoryPayload) => {
    void handleLoadHistory(context, payload);
  });

  socket.on("get_participants", (payload: JoinRoomPayload) => {
    handleGetParticipants(socket, payload);
  });

  socket.on("delete_message", (payload: DeleteMessagePayload) => {
    void handleDeleteMessage(context, payload);
  });

  socket.on("leave_room", (payload: JoinRoomPayload) => {
    handleLeaveRoom(context, payload);
  });

  socket.on("club_visit", async (payload: { clubId?: string }) => {
    const { clubId } = payload ?? {};
    if (typeof clubId !== "string" || !clubId) return;

    try {
      await presenceService.markOnlineInClub(clubId, context.user.userId);

      if (!Array.isArray(socket.data.visitedClubs)) socket.data.visitedClubs = [];
      const visited = new Set(socket.data.visitedClubs as string[]);
      visited.add(clubId);
      socket.data.visitedClubs = Array.from(visited);

      // join в presence-комнату чтобы получать обновления
      void socket.join(`presence:${clubId}`);

      // уведомляем всех в клубе о новом онлайн-участнике
      const onlineUserIds = await presenceService.getClubOnlineUserIds(clubId);
      context.io.to(`presence:${clubId}`).emit("club:presence_update", {
        clubId,
        onlineUserIds,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, clubId }, "[WS Chat] club_visit error");
    }
  });

  socket.on("club_leave", async (payload: { clubId?: string }) => {
    const { clubId } = payload ?? {};
    if (typeof clubId !== "string" || !clubId) return;

    try {
      await presenceService.leaveClub(clubId, context.user.userId);

      if (Array.isArray(socket.data.visitedClubs)) {
        socket.data.visitedClubs = (socket.data.visitedClubs as string[]).filter((id) => id !== clubId);
      }

      void socket.leave(`presence:${clubId}`);
      const onlineUserIds = await presenceService.getClubOnlineUserIds(clubId);
      context.io.to(`presence:${clubId}`).emit("club:presence_update", {
        clubId,
        onlineUserIds,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, clubId }, "[WS Chat] club_leave error");
    }
  });

  socket.on("disconnect", async () => {
    const visited = socket.data.visitedClubs as string[] | undefined;
    if (Array.isArray(visited) && visited.length > 0) {
      const uniqueVisited = Array.from(new Set(visited));

      try {
        await presenceService.leaveAllClubs(context.user.userId);
        for (const clubId of uniqueVisited) {
          const onlineUserIds = await presenceService.getClubOnlineUserIds(clubId);
          context.io.to(`presence:${clubId}`).emit("club:presence_update", {
            clubId,
            onlineUserIds,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "[WS Chat] disconnect presence cleanup error");
      }
    }

    handleDisconnect(context.io, context.user);
  });
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
    const user = getAuthenticatedUser(socket);
    logger.info(`[WS Chat] User ${user.username} (${user.userId}) connected`);

    registerChatSocketHandlers({ io, socket, user });
  });

  logger.info("[WS Chat] WebSocket server initialized at /ws/chat");

  httpServer.once("close", () => {
    clearInterval(historyCleanupInterval);
  });

  return io;
}
