import { BaseRepository } from './BaseRepository.js';
import { eq, and, or, desc, sql, lt, inArray } from 'drizzle-orm';
import {
  conversations,
  directMessages,
  conversationUnread,
  systemSettings,
  userProfiles,
  userPrivacySettings,
  userFollows,
  userBlocks,
  users,
} from '../../shared/schema.js';
import type { Conversation } from '../../shared/schema.js';

export interface ConversationWithParticipant {
  id: string;
  otherUser: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
  };
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  createdAt: Date;
}

export interface DmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  isDeleted: boolean;
  createdAt: Date;
  readAt: Date | null;
}

export interface DmUnreadPreview {
  conversationId: string;
  senderUsername: string;
}

export interface DmRetentionSettings {
  adminMaxDays: number;
  hardDeleteGraceDays: number;
  userDays: number;
  effectiveDays: number;
}

export interface DmRetentionCleanupStats {
  softDeleted: number;
  hardDeleted: number;
  durationMs: number;
  batchSize: number;
  adminMaxDays: number;
  hardDeleteGraceDays: number;
}

type DmRetentionCandidateRow = {
  id: string;
  createdAt: Date;
  senderId: string;
  participantA: string;
  participantB: string;
};

const MIN_DM_RETENTION_DAYS = 10;
const MAX_DM_RETENTION_DAYS = 365;
const DEFAULT_DM_RETENTION_DAYS = 365;
const DEFAULT_DM_HARD_DELETE_GRACE_DAYS = 30;
const DEFAULT_DM_CLEANUP_BATCH_SIZE = 3000;

const DM_RETENTION_ADMIN_MAX_KEY = 'dm.retention.admin_max_days';
const DM_RETENTION_HARD_DELETE_GRACE_KEY = 'dm.retention.hard_delete_grace_days';
const DM_RETENTION_USER_PREFIX = 'dm.retention.user.';

function clampDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DM_RETENTION_DAYS;
  return Math.min(MAX_DM_RETENTION_DAYS, Math.max(MIN_DM_RETENTION_DAYS, Math.trunc(value)));
}

function clampGraceDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DM_HARD_DELETE_GRACE_DAYS;
  return Math.min(MAX_DM_RETENTION_DAYS, Math.max(1, Math.trunc(value)));
}

function toPositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

export class DmRepository extends BaseRepository {

  private getUserRetentionKey(userId: string): string {
    return `${DM_RETENTION_USER_PREFIX}${userId}.days`;
  }

  private async getSettingValue(key: string): Promise<string | null> {
    const rows = await this.db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    return rows[0]?.value ?? null;
  }

  private async upsertSetting(
    key: string,
    value: string,
    type: 'string' | 'number' | 'boolean' | 'json',
    category: string,
    description: string,
    updatedBy: string,
  ): Promise<void> {
    await this.db
      .insert(systemSettings)
      .values({
        key,
        value,
        type,
        category,
        description,
        isPublic: false,
        updatedBy,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value,
          type,
          category,
          description,
          updatedBy,
          updatedAt: new Date(),
        },
      });
  }

  async getAdminRetentionSettings(): Promise<{ adminMaxDays: number; hardDeleteGraceDays: number }> {
    const [rawAdminMax, rawGrace] = await Promise.all([
      this.getSettingValue(DM_RETENTION_ADMIN_MAX_KEY),
      this.getSettingValue(DM_RETENTION_HARD_DELETE_GRACE_KEY),
    ]);

    const adminMaxDays = clampDays(Number(rawAdminMax ?? DEFAULT_DM_RETENTION_DAYS));
    const hardDeleteGraceDays = clampGraceDays(Number(rawGrace ?? DEFAULT_DM_HARD_DELETE_GRACE_DAYS));

    return { adminMaxDays, hardDeleteGraceDays };
  }

  async updateAdminRetentionSettings(
    updatedBy: string,
    updates: { adminMaxDays?: number; hardDeleteGraceDays?: number },
  ): Promise<{ adminMaxDays: number; hardDeleteGraceDays: number }> {
    const current = await this.getAdminRetentionSettings();
    const nextAdminMax =
      typeof updates.adminMaxDays === 'number'
        ? clampDays(updates.adminMaxDays)
        : current.adminMaxDays;
    const nextGrace =
      typeof updates.hardDeleteGraceDays === 'number'
        ? clampGraceDays(updates.hardDeleteGraceDays)
        : current.hardDeleteGraceDays;

    await Promise.all([
      this.upsertSetting(
        DM_RETENTION_ADMIN_MAX_KEY,
        String(nextAdminMax),
        'number',
        'direct_messages',
        'Maximum DM retention days allowed by administrator',
        updatedBy,
      ),
      this.upsertSetting(
        DM_RETENTION_HARD_DELETE_GRACE_KEY,
        String(nextGrace),
        'number',
        'direct_messages',
        'Grace period in days before hard delete for soft-deleted DM messages',
        updatedBy,
      ),
    ]);

    return {
      adminMaxDays: nextAdminMax,
      hardDeleteGraceDays: nextGrace,
    };
  }

  async getUserRetentionSettings(userId: string): Promise<DmRetentionSettings> {
    const { adminMaxDays, hardDeleteGraceDays } = await this.getAdminRetentionSettings();
    const rawUserDays = await this.getSettingValue(this.getUserRetentionKey(userId));
    const userDays = rawUserDays ? clampDays(Number(rawUserDays)) : adminMaxDays;
    const effectiveDays = Math.min(userDays, adminMaxDays);

    return {
      adminMaxDays,
      hardDeleteGraceDays,
      userDays,
      effectiveDays,
    };
  }

  async updateUserRetentionDays(userId: string, updatedBy: string, days: number): Promise<DmRetentionSettings> {
    const { adminMaxDays } = await this.getAdminRetentionSettings();
    const normalizedDays = clampDays(days);
    const persistedDays = Math.min(normalizedDays, adminMaxDays);

    await this.upsertSetting(
      this.getUserRetentionKey(userId),
      String(persistedDays),
      'number',
      'direct_messages',
      'Per-user DM retention days',
      updatedBy,
    );

    return this.getUserRetentionSettings(userId);
  }

  private async resolveRetentionDaysForUser(
    userId: string,
    adminMaxDays: number,
    cache: Map<string, number>,
  ): Promise<number> {
    const cached = cache.get(userId);
    if (cached !== undefined) return cached;

    const raw = await this.getSettingValue(this.getUserRetentionKey(userId));
    const value = raw ? clampDays(Number(raw)) : adminMaxDays;
    const effective = Math.min(value, adminMaxDays);
    cache.set(userId, effective);
    return effective;
  }

  private async loadCleanupCandidates(
    isDeleted: boolean,
    threshold: Date,
    batchSize: number,
  ): Promise<DmRetentionCandidateRow[]> {
    const rows = await this.db
      .select({
        id: directMessages.id,
        createdAt: directMessages.createdAt,
        senderId: directMessages.senderId,
        participantA: conversations.participantA,
        participantB: conversations.participantB,
      })
      .from(directMessages)
      .innerJoin(conversations, eq(conversations.id, directMessages.conversationId))
      .where(
        and(
          eq(directMessages.isDeleted, isDeleted),
          lt(directMessages.createdAt, threshold),
        ),
      )
      .orderBy(directMessages.createdAt)
      .limit(batchSize);

    return rows.filter((row): row is DmRetentionCandidateRow => !!row.createdAt);
  }

  private async getEffectiveRetentionDaysForMessage(
    row: DmRetentionCandidateRow,
    adminMaxDays: number,
    retentionCache: Map<string, number>,
  ): Promise<number> {
    const recipientId = row.senderId === row.participantA ? row.participantB : row.participantA;
    const [senderDays, recipientDays] = await Promise.all([
      this.resolveRetentionDaysForUser(row.senderId, adminMaxDays, retentionCache),
      this.resolveRetentionDaysForUser(recipientId, adminMaxDays, retentionCache),
    ]);
    return Math.min(adminMaxDays, senderDays, recipientDays);
  }

  private async collectSoftDeleteIds(
    candidates: DmRetentionCandidateRow[],
    adminMaxDays: number,
    retentionCache: Map<string, number>,
    nowMs: number,
  ): Promise<string[]> {
    const toSoftDelete: string[] = [];
    for (const row of candidates) {
      const effectiveDays = await this.getEffectiveRetentionDaysForMessage(row, adminMaxDays, retentionCache);
      const expiresAt = row.createdAt.getTime() + effectiveDays * 24 * 60 * 60 * 1000;
      if (expiresAt <= nowMs) {
        toSoftDelete.push(row.id);
      }
    }
    return toSoftDelete;
  }

  private async collectHardDeleteIds(
    candidates: DmRetentionCandidateRow[],
    adminMaxDays: number,
    hardDeleteGraceDays: number,
    retentionCache: Map<string, number>,
    nowMs: number,
  ): Promise<string[]> {
    const toHardDelete: string[] = [];
    for (const row of candidates) {
      const effectiveDays = await this.getEffectiveRetentionDaysForMessage(row, adminMaxDays, retentionCache);
      const hardDeleteAt = row.createdAt.getTime() + (effectiveDays + hardDeleteGraceDays) * 24 * 60 * 60 * 1000;
      if (hardDeleteAt <= nowMs) {
        toHardDelete.push(row.id);
      }
    }
    return toHardDelete;
  }

  async runRetentionCleanup(
    options?: { batchSize?: number; now?: Date },
  ): Promise<DmRetentionCleanupStats> {
    const startedAt = Date.now();
    const now = options?.now ?? new Date();
    const batchSize = toPositiveInt(options?.batchSize, DEFAULT_DM_CLEANUP_BATCH_SIZE);
    const { adminMaxDays, hardDeleteGraceDays } = await this.getAdminRetentionSettings();

    const retentionCache = new Map<string, number>();

    let softDeleted = 0;
    let hardDeleted = 0;

    const nowMs = now.getTime();
    const softThresholdMs = nowMs - MIN_DM_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    while (true) {
      const candidates = await this.loadCleanupCandidates(false, new Date(softThresholdMs), batchSize);

      if (candidates.length === 0) {
        break;
      }

      const toSoftDelete = await this.collectSoftDeleteIds(candidates, adminMaxDays, retentionCache, nowMs);

      if (toSoftDelete.length === 0) {
        break;
      }

      await this.db
        .update(directMessages)
        .set({ isDeleted: true, body: '' })
        .where(inArray(directMessages.id, toSoftDelete));

      softDeleted += toSoftDelete.length;
    }

    const hardThresholdMs = nowMs - (MIN_DM_RETENTION_DAYS + hardDeleteGraceDays) * 24 * 60 * 60 * 1000;
    while (true) {
      const candidates = await this.loadCleanupCandidates(true, new Date(hardThresholdMs), batchSize);

      if (candidates.length === 0) {
        break;
      }

      const toHardDelete = await this.collectHardDeleteIds(
        candidates,
        adminMaxDays,
        hardDeleteGraceDays,
        retentionCache,
        nowMs,
      );

      if (toHardDelete.length === 0) {
        break;
      }

      const deleted = await this.db
        .delete(directMessages)
        .where(inArray(directMessages.id, toHardDelete))
        .returning({ id: directMessages.id });

      hardDeleted += deleted.length;
    }

    return {
      softDeleted,
      hardDeleted,
      durationMs: Date.now() - startedAt,
      batchSize,
      adminMaxDays,
      hardDeleteGraceDays,
    };
  }

  /** Проверить право инициировать ЛС согласно настройкам приватности */
  async canInitiateDm(fromId: string, toId: string): Promise<boolean> {
    // Заблокирован ли отправитель получателем?
    const block = await this.db
      .select({ id: userBlocks.id })
      .from(userBlocks)
      .where(and(
        eq(userBlocks.blockerId, toId),
        eq(userBlocks.blockedId, fromId),
      ))
      .limit(1);
    if (block.length > 0) return false;

    // Настройки приватности получателя
    const privacy = await this.db
      .select({ allowDmFrom: userPrivacySettings.allowDmFrom })
      .from(userPrivacySettings)
      .where(eq(userPrivacySettings.userId, toId))
      .limit(1);

    const allowDmFrom = privacy[0]?.allowDmFrom ?? 'followers';

    if (allowDmFrom === 'everyone') return true;
    if (allowDmFrom === 'nobody') return false;

    // 'followers' — только если fromId подписан на toId
    const follow = await this.db
      .select({ id: userFollows.id })
      .from(userFollows)
      .where(and(
        eq(userFollows.followerId, fromId),
        eq(userFollows.followingId, toId),
      ))
      .limit(1);
    return follow.length > 0;
  }

  /** Получить или создать диалог между двумя пользователями */
  async getOrCreateConversation(userA: string, userB: string): Promise<Conversation> {
    // Нормализуем пару: participant_a < participant_b
    const [pA, pB] = [userA, userB].sort((left, right) => left.localeCompare(right));

    const existing = await this.db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.participantA, pA),
        eq(conversations.participantB, pB),
      ))
      .limit(1);

    if (existing.length > 0) return existing[0];

    const result = await this.db
      .insert(conversations)
      .values({ participantA: pA, participantB: pB })
      .returning();

    // Инициализировать счётчики непрочитанных
    await this.db.insert(conversationUnread).values([
      { conversationId: result[0].id, userId: pA, unreadCount: 0 },
      { conversationId: result[0].id, userId: pB, unreadCount: 0 },
    ]).onConflictDoNothing();

    return result[0];
  }

  /** Список диалогов текущего пользователя (с превью последнего сообщения) */
  async listConversations(userId: string): Promise<ConversationWithParticipant[]> {
    const rows = await this.db
      .select({
        id: conversations.id,
        participantA: conversations.participantA,
        participantB: conversations.participantB,
        lastMessageAt: conversations.lastMessageAt,
        lastMessageId: conversations.lastMessageId,
        createdAt: conversations.createdAt,
        unreadCount: conversationUnread.unreadCount,
      })
      .from(conversations)
      .innerJoin(
        conversationUnread,
        and(
          eq(conversationUnread.conversationId, conversations.id),
          eq(conversationUnread.userId, userId),
        ),
      )
      .where(or(
        eq(conversations.participantA, userId),
        eq(conversations.participantB, userId),
      ))
      .orderBy(desc(conversations.lastMessageAt));

    if (rows.length === 0) return [];

    // Получаем профили всех собеседников за один запрос
    const otherIds = rows.map(r => r.participantA === userId ? r.participantB : r.participantA);
    const uniqueIds = [...new Set(otherIds)];

    const profiles = await this.db
      .select({
        userId: users.id,
        username: users.username,
        displayName: userProfiles.displayName,
        avatar: userProfiles.avatar,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(inArray(users.id, uniqueIds));

    const profileMap = new Map(profiles.map(p => [p.userId, p]));

    // Получаем превью последнего сообщения
    const lastMsgIds = rows.map(r => r.lastMessageId).filter(Boolean) as string[];
    let lastMsgMap = new Map<string, string>();
    if (lastMsgIds.length > 0) {
      const msgs = await this.db
        .select({ id: directMessages.id, body: directMessages.body, isDeleted: directMessages.isDeleted })
        .from(directMessages)
        .where(inArray(directMessages.id, lastMsgIds));
      lastMsgMap = new Map(msgs.map(m => [m.id, m.isDeleted ? '🗑 Сообщение удалено' : m.body]));
    }

    return rows.map(r => {
      const otherId = r.participantA === userId ? r.participantB : r.participantA;
      const profile = profileMap.get(otherId);
      return {
        id: r.id,
        otherUser: {
          id: otherId,
          username: profile?.username ?? otherId,
          displayName: profile?.displayName ?? null,
          avatar: profile?.avatar ?? null,
        },
        lastMessageAt: r.lastMessageAt,
        lastMessagePreview: r.lastMessageId ? (lastMsgMap.get(r.lastMessageId) ?? null) : null,
        unreadCount: r.unreadCount,
        createdAt: r.createdAt,
      };
    });
  }

  /** Сообщения диалога с cursor-пагинацией (вверх) */
  async getMessages(conversationId: string, userId: string, limit = 40, before?: string): Promise<DmMessage[]> {
    // Убедиться что пользователь — участник диалога
    const conv = await this.db
      .select({ participantA: conversations.participantA, participantB: conversations.participantB })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (conv.length === 0) return [];
    const c = conv[0];
    if (c.participantA !== userId && c.participantB !== userId) return [];

    const query = this.db
      .select()
      .from(directMessages)
      .where(
        before
          ? and(
              eq(directMessages.conversationId, conversationId),
              lt(directMessages.createdAt, sql`(SELECT created_at FROM direct_messages WHERE id = ${before})`),
            )
          : eq(directMessages.conversationId, conversationId),
      )
      .orderBy(desc(directMessages.createdAt))
      .limit(limit);

    const rows = await query;
    return rows.reverse(); // вернуть в хронологическом порядке
  }

  /** Отправить сообщение */
  async sendMessage(conversationId: string, senderId: string, body: string): Promise<DmMessage> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error('VALIDATION_ERROR: Empty message body');
    if (trimmed.length > 4000) throw new Error('VALIDATION_ERROR: Message too long');

    // Вставить сообщение
    const [msg] = await this.db
      .insert(directMessages)
      .values({ conversationId, senderId, body: trimmed })
      .returning();

    // Обновить lastMessageAt и lastMessageId в диалоге
    await this.db
      .update(conversations)
      .set({ lastMessageAt: msg.createdAt, lastMessageId: msg.id })
      .where(eq(conversations.id, conversationId));

    // Увеличить счётчик непрочитанных у получателя
    const conv = await this.db
      .select({ participantA: conversations.participantA, participantB: conversations.participantB })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (conv.length > 0) {
      const recipientId = conv[0].participantA === senderId ? conv[0].participantB : conv[0].participantA;
      await this.db.execute(sql`
        INSERT INTO conversation_unread (conversation_id, user_id, unread_count)
        VALUES (${conversationId}, ${recipientId}, 1)
        ON CONFLICT (conversation_id, user_id)
        DO UPDATE SET unread_count = conversation_unread.unread_count + 1
      `);
    }

    return msg;
  }

  /** Пометить все сообщения диалога прочитанными */
  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    await this.db
      .update(directMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(directMessages.conversationId, conversationId),
          sql`${directMessages.senderId} != ${userId}`,
          sql`${directMessages.readAt} IS NULL`,
        ),
      );

    // Обнулить счётчик
    await this.db.execute(sql`
      INSERT INTO conversation_unread (conversation_id, user_id, unread_count)
      VALUES (${conversationId}, ${userId}, 0)
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET unread_count = 0
    `);
  }

  /** Удалить своё сообщение (soft delete) */
  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .update(directMessages)
      .set({ isDeleted: true, body: '' })
      .where(and(
        eq(directMessages.id, messageId),
        eq(directMessages.senderId, userId),
      ))
      .returning({ id: directMessages.id });
    return result.length > 0;
  }

  /** Суммарное количество непрочитанных ЛС для пользователя */
  async getTotalUnread(userId: string): Promise<number> {
    const result = await this.db
      .select({ total: sql<number>`COALESCE(SUM(unread_count), 0)` })
      .from(conversationUnread)
      .where(eq(conversationUnread.userId, userId));
    return Number(result[0]?.total ?? 0);
  }

  /** Последнее непрочитанное входящее сообщение для строки в колокольчике */
  async getLatestUnreadPreview(userId: string): Promise<DmUnreadPreview | null> {
    const rows = await this.db
      .select({
        conversationId: directMessages.conversationId,
        senderUsername: users.username,
      })
      .from(directMessages)
      .innerJoin(conversations, eq(conversations.id, directMessages.conversationId))
      .innerJoin(users, eq(users.id, directMessages.senderId))
      .where(and(
        sql`${directMessages.readAt} IS NULL`,
        sql`${directMessages.senderId} != ${userId}`,
        or(
          eq(conversations.participantA, userId),
          eq(conversations.participantB, userId),
        ),
      ))
      .orderBy(desc(directMessages.createdAt))
      .limit(1);

    return rows[0] ?? null;
  }

  /** Получить диалог по id, убедиться что userId — участник */
  async getConversation(conversationId: string, userId: string): Promise<Conversation | null> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.id, conversationId),
        or(
          eq(conversations.participantA, userId),
          eq(conversations.participantB, userId),
        ),
      ))
      .limit(1);
    return rows[0] ?? null;
  }
}
