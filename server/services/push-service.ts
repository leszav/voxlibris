import webpush from 'web-push';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { logger } from '../lib/logger.js';
import {
  pushNotificationLog,
  pushNotificationSettings,
  pushSubscriptions,
} from '../../shared/schema.js';

export type PushNotificationType =
  | 'session_started'
  | 'session_reminder'
  | 'club_discussion'
  | 'mention_in_chat'
  | 'dm_received'
  | 'club_moderation'
  | 'new_follower'
  | 'streak_reminder'
  | 'achievement_unlocked'
  | 'test';

export interface PushPayload {
  type: PushNotificationType;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface BrowserPushSubscriptionInput {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
  deviceName?: string;
}

export type PushSettings = typeof pushNotificationSettings.$inferSelect;

export type PushSendSkipReason =
  | 'not_configured'
  | 'disabled_by_settings'
  | 'quiet_hours'
  | 'daily_limit'
  | 'no_active_subscriptions'
  | 'send_failed';

export interface PushSendResult {
  sent: number;
  skipped: boolean;
  reason?: PushSendSkipReason;
}

export interface PushSendOptions {
  bypassLimits?: boolean;
}

const DAILY_PUSH_LIMIT = 3;

function getVapidEmail(): string | undefined {
  const email = process.env.VAPID_EMAIL;
  if (!email) return undefined;
  return email.startsWith('mailto:') ? email : `mailto:${email}`;
}

function isGoneError(error: unknown): boolean {
  const maybeStatus = error as { statusCode?: number; status?: number };
  return maybeStatus.statusCode === 404 || maybeStatus.statusCode === 410 || maybeStatus.status === 404 || maybeStatus.status === 410;
}

export class PushService {
  private configured = false;

  constructor() {
    this.configure();
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  async saveSubscription(userId: string, input: BrowserPushSubscriptionInput, userAgent?: string): Promise<void> {
    await db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: input.endpoint,
        auth: input.keys.auth,
        p256dh: input.keys.p256dh,
        userAgent: userAgent || null,
        deviceName: input.deviceName || null,
        isActive: true,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
        set: {
          auth: input.keys.auth,
          p256dh: input.keys.p256dh,
          userAgent: userAgent || null,
          deviceName: input.deviceName || null,
          isActive: true,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    await this.updateSettings(userId, { pushEnabled: true });
  }

  async unsubscribe(userId: string, endpoint?: string): Promise<void> {
    await db
      .update(pushSubscriptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(endpoint
        ? and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))
        : eq(pushSubscriptions.userId, userId));

    await this.updateSettings(userId, { pushEnabled: false });
  }

  async getSettings(userId: string): Promise<PushSettings> {
    const [existing] = await db
      .select()
      .from(pushNotificationSettings)
      .where(eq(pushNotificationSettings.userId, userId))
      .limit(1);

    if (existing) return existing;

    const [created] = await db
      .insert(pushNotificationSettings)
      .values({ userId })
      .onConflictDoNothing()
      .returning();

    if (created) return created;

    const [row] = await db
      .select()
      .from(pushNotificationSettings)
      .where(eq(pushNotificationSettings.userId, userId))
      .limit(1);

    return row;
  }

  async updateSettings(userId: string, updates: Partial<Omit<PushSettings, 'userId' | 'updatedAt'>>): Promise<PushSettings> {
    const allowedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    );

    const [settings] = await db
      .insert(pushNotificationSettings)
      .values({ userId, ...allowedUpdates, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: pushNotificationSettings.userId,
        set: { ...allowedUpdates, updatedAt: new Date() },
      })
      .returning();

    return settings;
  }

  async sendToUser(userId: string, payload: PushPayload, options: PushSendOptions = {}): Promise<PushSendResult> {
    if (!this.configured) {
      logger.debug('[push] VAPID is not configured, skipping push send');
      return { sent: 0, skipped: true, reason: 'not_configured' };
    }

    const settings = await this.getSettings(userId);
    if (!this.isAllowedBySettings(settings, payload.type)) {
      return { sent: 0, skipped: true, reason: 'disabled_by_settings' };
    }

    if (!options.bypassLimits && this.isQuietHour(settings)) {
      return { sent: 0, skipped: true, reason: 'quiet_hours' };
    }

    if (!options.bypassLimits) {
      const sentToday = await this.countSentToday(userId);
      if (sentToday >= DAILY_PUSH_LIMIT) {
        return { sent: 0, skipped: true, reason: 'daily_limit' };
      }
    }

    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.isActive, true)));

    if (subscriptions.length === 0) {
      return { sent: 0, skipped: true, reason: 'no_active_subscriptions' };
    }

    let sent = 0;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { auth: subscription.auth, p256dh: subscription.p256dh },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-72.png',
            url: payload.url || '/',
            tag: payload.tag || payload.type,
          }),
          { TTL: 3600 },
        );
        sent += 1;
      } catch (error) {
        logger.warn({ error, subscriptionId: subscription.id }, '[push] Failed to send push notification');
        if (isGoneError(error)) {
          await db
            .update(pushSubscriptions)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(pushSubscriptions.id, subscription.id));
        }
      }
    }

    await db.insert(pushNotificationLog).values({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      url: payload.url || null,
    });

    return sent > 0
      ? { sent, skipped: false }
      : { sent: 0, skipped: true, reason: 'send_failed' };
  }

  private configure(): void {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const email = getVapidEmail();

    if (!publicKey || !privateKey || !email) {
      this.configured = false;
      return;
    }

    webpush.setVapidDetails(email, publicKey, privateKey);
    this.configured = true;
  }

  private async countSentToday(userId: string): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(pushNotificationLog)
      .where(and(eq(pushNotificationLog.userId, userId), gt(pushNotificationLog.sentAt, since)));

    return Number(row?.count ?? 0);
  }

  private isAllowedBySettings(settings: PushSettings, type: PushNotificationType): boolean {
    if (!settings.pushEnabled && type !== 'test') return false;

    switch (type) {
      case 'session_started':
        return settings.sessionStarted;
      case 'session_reminder':
        return settings.sessionReminder;
      case 'club_discussion':
        return settings.clubDiscussion;
      case 'mention_in_chat':
        return settings.mentionInChat;
      case 'dm_received':
        return settings.dmReceived;
      case 'club_moderation':
        return settings.clubDiscussion;
      case 'new_follower':
        return settings.newFollower;
      case 'streak_reminder':
        return settings.streakReminder;
      case 'achievement_unlocked':
        return settings.achievementUnlocked;
      case 'test':
        return true;
      default:
        return false;
    }
  }

  private isQuietHour(settings: PushSettings): boolean {
    if (!settings.quietHoursEnabled) return false;

    const start = settings.quietHoursStart ?? 23;
    const end = settings.quietHoursEnd ?? 8;
    const currentHour = new Date().getHours();

    if (start === end) return true;
    if (start < end) return currentHour >= start && currentHour < end;
    return currentHour >= start || currentHour < end;
  }
}

export const pushService = new PushService();
