import type { Server as SocketIOServer, Socket } from 'socket.io';
import { repositories } from './repositories/index.js';
import { logger } from './lib/logger.js';
import { gamificationService } from './services/gamification-service.js';

interface AuthenticatedSocket extends Socket {
  data: { userId?: string };
}

/**
 * DM real-time через главный Socket.IO.
 * Клиент при авторизации вызывает emit('dm:join', userId) — присоединяется к комнате dm:<userId>.
 * Сервер шлёт:
 *   dm:new_message   — { conversationId, message }
 *   dm:unread_count  — { count }
 * Клиент шлёт:
 *   dm:join          — userId (string)
 *   dm:send          — { conversationId, body, tempId? }
 *   dm:read          — { conversationId }
 */
export function initializeDmHandlers(io: SocketIOServer): void {
  io.on('connection', (socket: AuthenticatedSocket) => {
    // Присоединиться к персональной DM-комнате.
    // userId уже установлен middleware из cookie при handshake.
    socket.on('dm:join', () => {
      if (!socket.data.userId) return;
      void socket.join(`dm:${socket.data.userId}`);
    });

    // Отправка сообщения через сокет
    socket.on('dm:send', async (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const { conversationId, body, tempId } = payload as {
        conversationId?: string;
        body?: string;
        tempId?: string;
      };

      const senderId = socket.data.userId;

      if (!conversationId || !body || !senderId) return;
      if (typeof conversationId !== 'string' || typeof body !== 'string') return;

      try {
        // Проверяем что senderId — участник диалога
        const conv = await repositories.dm.getConversation(conversationId, senderId);
        if (!conv) return;

        const msg = await repositories.dm.sendMessage(conversationId, senderId, body);

        const recipientId = conv.participantA === senderId ? conv.participantB : conv.participantA;

        // Эхо отправителю (подтверждение + замена tempId)
        socket.emit('dm:message_sent', { tempId, message: msg });

        // Доставка получателю
        io.to(`dm:${recipientId}`).emit('dm:new_message', {
          conversationId,
          message: msg,
        });

        // Обновить unread badge у получателя
        const recipientUnread = await repositories.dm.getTotalUnread(recipientId);
        io.to(`dm:${recipientId}`).emit('dm:unread_count', { count: recipientUnread });

        gamificationService.recordUserActivityAndAward(senderId, 'dm_socket_sent').catch((syncErr) => {
          logger.warn({ syncErr, senderId }, '[gamification] dm socket sync failed');
        });
      } catch (err) {
        logger.error({ err }, '[dm] socket send error');
        socket.emit('dm:error', { tempId, error: 'Failed to send message' });
      }
    });

    // Пометить диалог прочитанным
    socket.on('dm:read', async (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const { conversationId } = payload as { conversationId?: string };
      const userId = socket.data.userId;
      if (!conversationId || !userId) return;

      try {
        await repositories.dm.markConversationRead(conversationId, userId);
        const totalUnread = await repositories.dm.getTotalUnread(userId);
        socket.emit('dm:unread_count', { count: totalUnread });
      } catch (err) {
        logger.error({ err }, '[dm] socket read error');
      }
    });
  });
}
