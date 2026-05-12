import { Router, type Request, type Response } from 'express';
import { repositories } from '../repositories/index.js';
import { logger } from '../lib/logger.js';
import { getIO } from '../lib/socket-registry.js';
import { gamificationService } from '../services/gamification-service.js';
import { db } from '../db.js';
import { directMessages, dmReports } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../jwt-middleware.js';

const router = Router();
const MIN_RETENTION_DAYS = 10;
const MAX_RETENTION_DAYS = 365;

function normalizeRetentionDays(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  const normalized = Math.trunc(num);
  if (normalized < MIN_RETENTION_DAYS || normalized > MAX_RETENTION_DAYS) return null;
  return normalized;
}

/**
 * GET /api/dm/conversations
 * Список диалогов текущего пользователя
 */
router.get('/conversations', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const convs = await repositories.dm.listConversations(userId);
    res.json({ conversations: convs });
  } catch (err) {
    logger.error({ err }, '[dm] listConversations error');
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

/**
 * POST /api/dm/conversations
 * Открыть/найти диалог с пользователем (или создать новый)
 */
router.post('/conversations', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { recipientId } = req.body as { recipientId?: string };
  if (!recipientId || typeof recipientId !== 'string') {
    return res.status(400).json({ error: 'recipientId required' });
  }
  if (recipientId === userId) {
    return res.status(400).json({ error: 'Cannot message yourself' });
  }

  try {
    const allowed = await repositories.dm.canInitiateDm(userId, recipientId);
    if (!allowed) {
      return res.status(403).json({ error: 'Not allowed to message this user' });
    }

    const conv = await repositories.dm.getOrCreateConversation(userId, recipientId);
    res.json({ conversation: conv });
  } catch (err) {
    logger.error({ err }, '[dm] getOrCreateConversation error');
    res.status(500).json({ error: 'Failed to open conversation' });
  }
});

/**
 * GET /api/dm/conversations/:id/messages
 * Сообщения диалога (cursor-пагинация, ?before=<messageId>)
 */
router.get('/conversations/:id/messages', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;
  const limit = Math.min(Number(req.query.limit) || 40, 100);

  try {
    const messages = await repositories.dm.getMessages(id, userId, limit, before);
    res.json({ messages });
  } catch (err) {
    logger.error({ err }, '[dm] getMessages error');
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

/**
 * POST /api/dm/conversations/:id/messages
 * Отправить сообщение (HTTP fallback; основной путь — Socket.IO)
 */
router.post('/conversations/:id/messages', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const { body } = req.body as { body?: string };
  if (!body || typeof body !== 'string') {
    return res.status(400).json({ error: 'body required' });
  }

  try {
    // Проверяем что пользователь — участник диалога
    const conv = await repositories.dm.getConversation(id, userId);
    if (!conv) return res.status(403).json({ error: 'Conversation not found or access denied' });

    const msg = await repositories.dm.sendMessage(id, userId, body);

    // Real-time доставка через Socket.IO
    const recipientId = conv.participantA === userId ? conv.participantB : conv.participantA;
    try {
      const io = getIO();
      io.to(`dm:${recipientId}`).emit('dm:new_message', {
        conversationId: id,
        message: msg,
      });
      // Обновить unread badge у получателя
      const totalUnread = await repositories.dm.getTotalUnread(recipientId);
      io.to(`dm:${recipientId}`).emit('dm:unread_count', { count: totalUnread });
    } catch (socketErr) {
      logger.warn({ socketErr }, '[dm] socket emit failed (non-fatal)');
    }

    gamificationService.recordUserActivityAndAward(userId, 'dm_http_sent').catch((syncErr) => {
      logger.warn({ syncErr, userId }, '[gamification] dm http sync failed');
    });

    res.status(201).json({ message: msg });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ error: msg.replace('VALIDATION_ERROR: ', '') });
    }
    logger.error({ err }, '[dm] sendMessage error');
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * POST /api/dm/conversations/:id/read
 * Пометить диалог прочитанным
 */
router.post('/conversations/:id/read', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;

  try {
    await repositories.dm.markConversationRead(id, userId);
    const totalUnread = await repositories.dm.getTotalUnread(userId);

    // Обновить unread badge для себя
    try {
      const io = getIO();
      io.to(`dm:${userId}`).emit('dm:unread_count', { count: totalUnread });
    } catch { /* non-fatal */ }

    res.json({ success: true, totalUnread });
  } catch (err) {
    logger.error({ err }, '[dm] markRead error');
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/**
 * DELETE /api/dm/messages/:msgId
 * Удалить своё сообщение (soft delete)
 */
router.delete('/messages/:msgId', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { msgId } = req.params;

  try {
    const ok = await repositories.dm.deleteMessage(msgId, userId);
    if (!ok) return res.status(403).json({ error: 'Message not found or not yours' });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, '[dm] deleteMessage error');
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

/**
 * GET /api/dm/unread
 * Суммарное количество непрочитанных ЛС
 */
router.get('/unread', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const count = await repositories.dm.getTotalUnread(userId);
    res.json({ count });
  } catch (err) {
    logger.error({ err }, '[dm] getTotalUnread error');
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * GET /api/dm/retention-settings
 * Настройки retention для текущего пользователя
 */
router.get('/retention-settings', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const settings = await repositories.dm.getUserRetentionSettings(userId);
    return res.json({ success: true, settings });
  } catch (err) {
    logger.error({ err }, '[dm] get retention settings error');
    return res.status(500).json({ error: 'Failed to load retention settings' });
  }
});

/**
 * PATCH /api/dm/retention-settings
 * Обновить персональный retention дней (10..365)
 */
router.patch('/retention-settings', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const days = normalizeRetentionDays((req.body as { days?: unknown })?.days);
  if (days === null) {
    return res.status(400).json({
      error: `days must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`,
    });
  }

  try {
    const settings = await repositories.dm.updateUserRetentionDays(userId, userId, days);
    return res.json({ success: true, settings });
  } catch (err) {
    logger.error({ err }, '[dm] update retention settings error');
    return res.status(500).json({ error: 'Failed to update retention settings' });
  }
});

/**
 * GET /api/dm/admin/retention-settings
 * Получить централизованные настройки retention ЛС
 */
router.get('/admin/retention-settings', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const settings = await repositories.dm.getAdminRetentionSettings();
    return res.json({ success: true, settings });
  } catch (err) {
    logger.error({ err }, '[dm] admin get retention settings error');
    return res.status(500).json({ error: 'Failed to load admin retention settings' });
  }
});

/**
 * PATCH /api/dm/admin/retention-settings
 * Обновить admin max days и grace days
 */
router.patch('/admin/retention-settings', requireAdmin, async (req: Request, res: Response) => {
  const adminId = req.user?.id;
  if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body as { adminMaxDays?: unknown; hardDeleteGraceDays?: unknown };

  const updates: { adminMaxDays?: number; hardDeleteGraceDays?: number } = {};

  if (body.adminMaxDays !== undefined) {
    const adminMaxDays = normalizeRetentionDays(body.adminMaxDays);
    if (adminMaxDays === null) {
      return res.status(400).json({
        error: `adminMaxDays must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`,
      });
    }
    updates.adminMaxDays = adminMaxDays;
  }

  if (body.hardDeleteGraceDays !== undefined) {
    const num = typeof body.hardDeleteGraceDays === 'number'
      ? body.hardDeleteGraceDays
      : Number(body.hardDeleteGraceDays);
    if (!Number.isFinite(num)) {
      return res.status(400).json({ error: 'hardDeleteGraceDays must be a number' });
    }
    const grace = Math.trunc(num);
    if (grace < 1 || grace > MAX_RETENTION_DAYS) {
      return res.status(400).json({ error: `hardDeleteGraceDays must be between 1 and ${MAX_RETENTION_DAYS}` });
    }
    updates.hardDeleteGraceDays = grace;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields provided' });
  }

  try {
    const settings = await repositories.dm.updateAdminRetentionSettings(adminId, updates);
    return res.json({ success: true, settings });
  } catch (err) {
    logger.error({ err }, '[dm] admin update retention settings error');
    return res.status(500).json({ error: 'Failed to update admin retention settings' });
  }
});

/**
 * POST /api/dm/admin/retention-cleanup/run
 * Форс-запуск очистки retention ЛС
 */
router.post('/admin/retention-cleanup/run', requireAdmin, async (req: Request, res: Response) => {
  const batchSizeRaw = (req.body as { batchSize?: unknown })?.batchSize;
  const batchSizeNum = typeof batchSizeRaw === 'number' ? batchSizeRaw : Number(batchSizeRaw);
  const batchSize = Number.isFinite(batchSizeNum) && Math.trunc(batchSizeNum) > 0
    ? Math.trunc(batchSizeNum)
    : undefined;

  try {
    const stats = await repositories.dm.runRetentionCleanup({ batchSize });
    return res.json({ success: true, stats });
  } catch (err) {
    logger.error({ err }, '[dm] manual retention cleanup error');
    return res.status(500).json({ error: 'Failed to run retention cleanup' });
  }
});

/**
 * POST /api/dm/messages/:msgId/report
 * Пожаловаться на сообщение
 */
router.post('/messages/:msgId/report', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { msgId } = req.params;
  const { category, comment } = req.body as { category: string; comment?: string };

  const validCategories = ['spam', 'harassment', 'threats', 'other'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: 'Неверная категория жалобы' });
  }

  try {
    // Проверяем, что пользователь — участник диалога, которому принадлежит сообщение
    const [msg] = await db
      .select({ conversationId: directMessages.conversationId })
      .from(directMessages)
      .where(eq(directMessages.id, msgId))
      .limit(1);

    if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });

    const conv = await repositories.dm.getConversation(msg.conversationId, userId);
    if (!conv) return res.status(403).json({ error: 'Нет доступа' });

    await db.insert(dmReports).values({
      messageId: msgId,
      reporterId: userId,
      category: category as 'spam' | 'harassment' | 'threats' | 'other',
      comment: comment?.trim() || null,
    }).onConflictDoNothing(); // уже пожаловался — молча игнорируем

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, '[dm] report message error');
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

export default router;
