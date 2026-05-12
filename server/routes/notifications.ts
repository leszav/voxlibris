import { Router, Request, Response } from 'express';
import { notificationService } from '../services/notification-service.js';
import { logger } from '../lib/logger.js';
import { db } from '../db.js';
import { notifications, users, type NotificationType } from '../../shared/schema.js';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { repositories } from '../repositories/index.js';

const router = Router();

/**
 * GET /api/notifications/settings
 * Получить настройки уведомлений текущего пользователя
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const settings = await notificationService.getUserNotificationSettings(userId);

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting notification settings: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get notification settings',
    });
  }
});

/**
 * PUT /api/notifications/settings
 * Обновить настройки уведомлений текущего пользователя
 */
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const {
      emailEnabled,
      pushEnabled,
      reminderMinutes,
      sessionStart,
      sessionEnd,
      newQuestion,
      notifyReply,
      notifyMention,
      notifyChapterReady,
      notifyMessage,
      notifyPlanUpdate,
    } = req.body;

    const success = await notificationService.updateUserNotificationSettings(userId, {
      emailEnabled,
      pushEnabled,
      reminderMinutes,
      sessionStart,
      sessionEnd,
      newQuestion,
      notifyReply,
      notifyMention,
      notifyChapterReady,
      notifyMessage,
      notifyPlanUpdate,
    });

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update notification settings',
      });
    }

    // Возвращаем обновленные настройки
    const settings = await notificationService.getUserNotificationSettings(userId);

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating notification settings: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification settings',
    });
  }
});

function isNotificationTypeEnabled(
  type: NotificationType,
  settings: {
    notifyReply: boolean;
    notifyMention: boolean;
    notifyChapterReady: boolean;
    notifyMessage: boolean;
    notifyPlanUpdate: boolean;
  },
): boolean {
  switch (type) {
    case 'reply':
      return settings.notifyReply;
    case 'mention':
      return settings.notifyMention;
    case 'chapter_ready':
      return settings.notifyChapterReady;
    case 'message':
      return settings.notifyMessage;
    case 'plan_update':
      return settings.notifyPlanUpdate;
    default:
      return true;
  }
}

type BellItem = {
  key: string;
  kind: string;
  count: number;
  groupLabel: string;
  detail: string;
  actionUrl: string;
  latestCreatedAt: string;
};

type UnreadNotificationRow = {
  id: string;
  type: NotificationType;
  kind: string | null;
  message: string;
  sourceUserId: string | null;
  actionUrl: string | null;
  entityId: string | null;
  payload: unknown;
  createdAt: Date;
};

type NotificationGroup = {
  key: string;
  kind: string;
  type: NotificationType;
  count: number;
  latestCreatedAt: Date;
  latestMessage: string;
  latestSourceUserId: string | null;
  latestActionUrl: string | null;
  latestEntityId: string | null;
  latestPayload: unknown;
  resolvedKind: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function resolveBellActionUrl(group: NotificationGroup): string {
  if (group.latestActionUrl?.trim()) {
    return group.latestActionUrl;
  }

  if (group.resolvedKind === 'club_discussion_reply') {
    const payload = asRecord(group.latestPayload);
    const clubId = payload && typeof payload.clubId === 'string' ? payload.clubId : null;
    if (clubId) {
      const discussionPart = group.latestEntityId ? `&discussion=${encodeURIComponent(group.latestEntityId)}` : '';
      return `/clubs/${encodeURIComponent(clubId)}?tab=discussion${discussionPart}`;
    }
  }

  return getBellActionUrl(group.type, group.resolvedKind);
}

async function resolveSourceUsernames(rows: UnreadNotificationRow[]): Promise<Map<string, string>> {
  const sourceUserIds = [...new Set(rows.map((r) => r.sourceUserId).filter((v): v is string => Boolean(v)))];
  if (sourceUserIds.length === 0) return new Map();

  const usersRows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, sourceUserIds));

  return new Map(usersRows.map((row) => [row.id, row.username]));
}

function groupNotifications(rows: UnreadNotificationRow[], settings: Awaited<ReturnType<typeof notificationService.getUserNotificationSettings>>): Map<string, NotificationGroup> {
  const grouped = new Map<string, NotificationGroup>();

  for (const row of rows) {
    const shouldSkip = !isNotificationTypeEnabled(row.type, settings) || row.type === 'message';
    if (shouldSkip) {
      continue;
    }

    const key = row.kind ?? row.type;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }

    grouped.set(key, {
      key,
      kind: key,
      type: row.type,
      count: 1,
      latestCreatedAt: row.createdAt,
      latestMessage: row.message,
      latestSourceUserId: row.sourceUserId,
      latestActionUrl: row.actionUrl,
      latestEntityId: row.entityId,
      latestPayload: row.payload,
      resolvedKind: row.kind,
    });
  }

  return grouped;
}

function buildNotificationItems(grouped: Map<string, NotificationGroup>, sourceUsernames: Map<string, string>): BellItem[] {
  return [...grouped.values()]
    .map((group) => {
      const sourceUsername = group.latestSourceUserId
        ? (sourceUsernames.get(group.latestSourceUserId) ?? null)
        : null;

      return {
        key: group.key,
        kind: group.kind,
        count: group.count,
        groupLabel: getBellLabel(group.type, group.resolvedKind),
        detail: getSingleDetail({
          kind: group.resolvedKind,
          count: group.count,
          message: group.latestMessage,
          sourceUsername,
        }),
        actionUrl: resolveBellActionUrl(group),
        latestCreatedAt: group.latestCreatedAt.toISOString(),
      };
    })
    .sort((a, b) => b.latestCreatedAt.localeCompare(a.latestCreatedAt));
}

function getBellLabel(type: NotificationType, kind: string | null): string {
  if (kind === 'followed_you') return 'На вас подписались';
  if (kind === 'club_discussion_reply') return 'Вам ответили в обсуждениях клуба';
  if (kind === 'club_membership_approved') return 'Вы приняты в клуб';

  switch (type) {
    case 'reply':
      return 'Вам ответили';
    case 'mention':
      return 'Вас упомянули';
    case 'chapter_ready':
      return 'Новые главы';
    case 'plan_update':
      return 'Изменения планов чтения';
    case 'message':
      return 'Личные сообщения';
    default:
      return 'Уведомления';
  }
}

function getBellActionUrl(type: NotificationType, kind: string | null): string {
  if (kind === 'followed_you') return '/profile?tab=followers';
  if (kind === 'club_discussion_reply') return '/dashboard?tab=notifications';
  if (kind === 'club_membership_approved') return '/clubs';

  switch (type) {
    case 'message':
      return '/dashboard?tab=messages';
    case 'chapter_ready':
      return '/library';
    default:
      return '/dashboard?tab=notifications';
  }
}

function getSingleDetail(params: {
  kind: string | null;
  count: number;
  message: string;
  sourceUsername: string | null;
}): string {
  if (params.count > 1) return String(params.count);

  if (params.kind === 'followed_you' && params.sourceUsername) {
    return `от пользователя ${params.sourceUsername}`;
  }

  if (params.message?.trim()) {
    return params.message;
  }

  return '1';
}

/**
 * GET /api/notifications/unread-summary
 * Сводка непрочитанных: отдельно личные сообщения и прочие уведомления,
 * с учетом пользовательской подписки на типы уведомлений.
 */
router.get('/unread-summary', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const settings = await notificationService.getUserNotificationSettings(userId);

    const unreadRows = await db
      .select({ type: notifications.type })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

    let notificationsUnread = 0;
    for (const row of unreadRows) {
      if (isNotificationTypeEnabled(row.type, settings) && row.type !== 'message') {
        notificationsUnread += 1;
      }
    }

    let messagesUnread = 0;
    try {
      messagesUnread = await repositories.dm.getTotalUnread(userId);
    } catch { /* DM таблицы могут не существовать на старых окружениях */ }

    res.json({
      success: true,
      messagesUnread,
      notificationsUnread,
      totalUnread: messagesUnread + notificationsUnread,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting unread summary: ${errorMessage}`);
    res.status(500).json({ success: false, error: 'Failed to get unread summary' });
  }
});

/**
 * GET /api/notifications/bell-items
 * Группированный список для колокольчика по правилу:
 * count=1 -> detail события, count>1 -> detail = счётчик
 */
router.get('/bell-items', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const settings = await notificationService.getUserNotificationSettings(userId);

    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        kind: notifications.kind,
        message: notifications.message,
        sourceUserId: notifications.sourceUserId,
        actionUrl: notifications.actionUrl,
        entityId: notifications.entityId,
        payload: notifications.payload,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .orderBy(desc(notifications.createdAt))
      .limit(200);

    const sourceUsernames = await resolveSourceUsernames(rows);
    const grouped = groupNotifications(rows, settings);

    let messagesUnread = 0;
    let dmPreview: { conversationId: string; senderUsername: string } | null = null;
    try {
      messagesUnread = await repositories.dm.getTotalUnread(userId);
      dmPreview = await repositories.dm.getLatestUnreadPreview(userId);
    } catch {
      // DM таблицы могут отсутствовать на старых окружениях
    }

    const notificationItems = buildNotificationItems(grouped, sourceUsernames);

    const dmItem: BellItem[] = messagesUnread > 0
      ? [{
          key: 'dm_message',
          kind: 'dm_message',
          count: messagesUnread,
          groupLabel: 'Личные сообщения',
          detail: messagesUnread === 1 && dmPreview
            ? `от пользователя ${dmPreview.senderUsername}`
            : String(messagesUnread),
          actionUrl: dmPreview
            ? `/dashboard?tab=messages&conv=${encodeURIComponent(dmPreview.conversationId)}`
            : '/dashboard?tab=messages',
          latestCreatedAt: new Date().toISOString(),
        }]
      : [];

    const items = [...dmItem, ...notificationItems]
      .sort((a, b) => b.latestCreatedAt.localeCompare(a.latestCreatedAt));

    res.json({
      success: true,
      items,
      totalUnread: messagesUnread + notificationItems.reduce((acc, item) => acc + item.count, 0),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting bell items: ${errorMessage}`);
    res.status(500).json({ success: false, error: 'Failed to get bell items' });
  }
});

/**
 * POST /api/notifications/mark-read
 * Пометить как прочитанные все уведомления или по конкретному виду.
 */
router.post('/mark-read', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const kind = typeof req.body?.kind === 'string' ? req.body.kind.trim() : '';

    if (kind === 'dm_message') {
      return res.json({ success: true, marked: 0 });
    }

    const whereClause = kind
      ? and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          or(eq(notifications.kind, kind), and(isNull(notifications.kind), eq(notifications.type, kind as NotificationType))),
        )
      : and(eq(notifications.userId, userId), isNull(notifications.readAt));

    const updated = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(whereClause)
      .returning({ id: notifications.id });

    res.json({ success: true, marked: updated.length });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error marking notifications as read: ${errorMessage}`);
    res.status(500).json({ success: false, error: 'Failed to mark notifications as read' });
  }
});

export default router;
