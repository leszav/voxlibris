import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  userFollows,
  userBlocks,
  userMutes,
  userPrivacySettings,
  userProfiles,
  users,
} from '../../shared/schema.js';
import type {
  UserPrivacySettings,
  InsertUserPrivacySettings,
} from '../../shared/schema.js';

export interface FollowUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  isReader: boolean;
  followersCount: number;
  followingCount: number;
}

export class SocialRepository extends BaseRepository {

  // ── Follow / Unfollow ──────────────────────────────────────────────────────

  async follow(followerId: string, followingId: string): Promise<void> {
    this.validateRequired(followerId, 'followerId');
    this.validateRequired(followingId, 'followingId');
    if (followerId === followingId) {
      throw new Error('VALIDATION_ERROR: Cannot follow yourself');
    }

    try {
      await this.db
        .insert(userFollows)
        .values({ followerId, followingId })
        .onConflictDoNothing();

      // Обновить денормализованные счётчики атомарно
      await this.db.execute(sql`
        UPDATE user_profiles SET following_count = following_count + 1
        WHERE user_id = ${followerId};
        UPDATE user_profiles SET followers_count = followers_count + 1
        WHERE user_id = ${followingId};
      `);
    } catch (error) {
      this.logError('SocialRepository.follow', error);
      throw error;
    }
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    this.validateRequired(followerId, 'followerId');
    this.validateRequired(followingId, 'followingId');

    try {
      const deleted = await this.db
        .delete(userFollows)
        .where(
          and(
            eq(userFollows.followerId, followerId),
            eq(userFollows.followingId, followingId),
          ),
        )
        .returning({ id: userFollows.id });

      if (deleted.length > 0) {
        await this.db.execute(sql`
          UPDATE user_profiles SET following_count = GREATEST(0, following_count - 1)
          WHERE user_id = ${followerId};
          UPDATE user_profiles SET followers_count = GREATEST(0, followers_count - 1)
          WHERE user_id = ${followingId};
        `);
      }
    } catch (error) {
      this.logError('SocialRepository.unfollow', error);
      throw error;
    }
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    try {
      const rows = await this.db
        .select({ id: userFollows.id })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.followerId, followerId),
            eq(userFollows.followingId, followingId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    } catch (error) {
      this.logError('SocialRepository.isFollowing', error);
      return false;
    }
  }

  async getFollowStatus(
    viewerId: string,
    targetId: string,
  ): Promise<{ isFollowing: boolean; isFollower: boolean }> {
    try {
      const [fwd, rev] = await Promise.all([
        this.isFollowing(viewerId, targetId),
        this.isFollowing(targetId, viewerId),
      ]);
      return { isFollowing: fwd, isFollower: rev };
    } catch (error) {
      this.logError('SocialRepository.getFollowStatus', error);
      return { isFollowing: false, isFollower: false };
    }
  }

  async getFollowers(
    userId: string,
    limit = 20,
    cursor?: string,
  ): Promise<{ users: FollowUser[]; nextCursor: string | null }> {
    this.validateRequired(userId, 'userId');
    try {
      const rows = await this.db
        .select({
          id: users.id,
          username: users.username,
          displayName: userProfiles.displayName,
          avatar: userProfiles.avatar,
          isReader: userProfiles.isReader,
          followersCount: userProfiles.followersCount,
          followingCount: userProfiles.followingCount,
          followCreatedAt: userFollows.createdAt,
        })
        .from(userFollows)
        .innerJoin(users, eq(userFollows.followerId, users.id))
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(
          cursor
            ? and(
                eq(userFollows.followingId, userId),
                sql`${userFollows.createdAt} < ${cursor}`,
              )
            : eq(userFollows.followingId, userId),
        )
        .orderBy(desc(userFollows.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items.at(-1)?.followCreatedAt?.toISOString() ?? null : null;

      return {
        users: items.map((r) => ({
          id: r.id,
          username: r.username,
          displayName: r.displayName,
          avatar: r.avatar,
          isReader: r.isReader ?? false,
          followersCount: r.followersCount ?? 0,
          followingCount: r.followingCount ?? 0,
        })),
        nextCursor,
      };
    } catch (error) {
      this.logError('SocialRepository.getFollowers', error);
      return { users: [], nextCursor: null };
    }
  }

  async getFollowing(
    userId: string,
    limit = 20,
    cursor?: string,
  ): Promise<{ users: FollowUser[]; nextCursor: string | null }> {
    this.validateRequired(userId, 'userId');
    try {
      const rows = await this.db
        .select({
          id: users.id,
          username: users.username,
          displayName: userProfiles.displayName,
          avatar: userProfiles.avatar,
          isReader: userProfiles.isReader,
          followersCount: userProfiles.followersCount,
          followingCount: userProfiles.followingCount,
          followCreatedAt: userFollows.createdAt,
        })
        .from(userFollows)
        .innerJoin(users, eq(userFollows.followingId, users.id))
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(
          cursor
            ? and(
                eq(userFollows.followerId, userId),
                sql`${userFollows.createdAt} < ${cursor}`,
              )
            : eq(userFollows.followerId, userId),
        )
        .orderBy(desc(userFollows.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items.at(-1)?.followCreatedAt?.toISOString() ?? null : null;

      return {
        users: items.map((r) => ({
          id: r.id,
          username: r.username,
          displayName: r.displayName,
          avatar: r.avatar,
          isReader: r.isReader ?? false,
          followersCount: r.followersCount ?? 0,
          followingCount: r.followingCount ?? 0,
        })),
        nextCursor,
      };
    } catch (error) {
      this.logError('SocialRepository.getFollowing', error);
      return { users: [], nextCursor: null };
    }
  }

  async getFollowerIds(userId: string): Promise<string[]> {
    try {
      const rows = await this.db
        .select({ followerId: userFollows.followerId })
        .from(userFollows)
        .where(eq(userFollows.followingId, userId));
      return rows.map((r) => r.followerId);
    } catch (error) {
      this.logError('SocialRepository.getFollowerIds', error);
      return [];
    }
  }

  // ── Block / Unblock ────────────────────────────────────────────────────────

  async block(blockerId: string, blockedId: string): Promise<void> {
    this.validateRequired(blockerId, 'blockerId');
    this.validateRequired(blockedId, 'blockedId');
    if (blockerId === blockedId) {
      throw new Error('VALIDATION_ERROR: Cannot block yourself');
    }

    try {
      await this.db
        .insert(userBlocks)
        .values({ blockerId, blockedId })
        .onConflictDoNothing();

      // При блокировке — убрать взаимные подписки
      await this.db
        .delete(userFollows)
        .where(
          and(
            eq(userFollows.followerId, blockerId),
            eq(userFollows.followingId, blockedId),
          ),
        );
      await this.db
        .delete(userFollows)
        .where(
          and(
            eq(userFollows.followerId, blockedId),
            eq(userFollows.followingId, blockerId),
          ),
        );

      // Пересчитать счётчики
      await this.recalcCounters(blockerId);
      await this.recalcCounters(blockedId);
    } catch (error) {
      this.logError('SocialRepository.block', error);
      throw error;
    }
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    this.validateRequired(blockerId, 'blockerId');
    this.validateRequired(blockedId, 'blockedId');
    try {
      await this.db
        .delete(userBlocks)
        .where(
          and(
            eq(userBlocks.blockerId, blockerId),
            eq(userBlocks.blockedId, blockedId),
          ),
        );
    } catch (error) {
      this.logError('SocialRepository.unblock', error);
      throw error;
    }
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    try {
      const rows = await this.db
        .select({ id: userBlocks.id })
        .from(userBlocks)
        .where(
          and(
            eq(userBlocks.blockerId, blockerId),
            eq(userBlocks.blockedId, blockedId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    } catch (error) {
      this.logError('SocialRepository.isBlocked', error);
      return false;
    }
  }

  /** Проверить блокировку в любую сторону */
  async isBlockedEither(userA: string, userB: string): Promise<boolean> {
    const [ab, ba] = await Promise.all([
      this.isBlocked(userA, userB),
      this.isBlocked(userB, userA),
    ]);
    return ab || ba;
  }

  async getBlockList(blockerId: string): Promise<Array<{ id: string; username: string; blockedAt: Date }>> {
    try {
      const rows = await this.db
        .select({
          id: users.id,
          username: users.username,
          blockedAt: userBlocks.createdAt,
        })
        .from(userBlocks)
        .innerJoin(users, eq(userBlocks.blockedId, users.id))
        .where(eq(userBlocks.blockerId, blockerId))
        .orderBy(desc(userBlocks.createdAt));
      return rows.map((r) => ({ id: r.id, username: r.username, blockedAt: r.blockedAt }));
    } catch (error) {
      this.logError('SocialRepository.getBlockList', error);
      return [];
    }
  }

  // ── Mute / Unmute ──────────────────────────────────────────────────────────

  async mute(muterId: string, mutedId: string): Promise<void> {
    this.validateRequired(muterId, 'muterId');
    this.validateRequired(mutedId, 'mutedId');
    if (muterId === mutedId) {
      throw new Error('VALIDATION_ERROR: Cannot mute yourself');
    }
    try {
      await this.db
        .insert(userMutes)
        .values({ muterId, mutedId })
        .onConflictDoNothing();
    } catch (error) {
      this.logError('SocialRepository.mute', error);
      throw error;
    }
  }

  async unmute(muterId: string, mutedId: string): Promise<void> {
    this.validateRequired(muterId, 'muterId');
    this.validateRequired(mutedId, 'mutedId');
    try {
      await this.db
        .delete(userMutes)
        .where(
          and(
            eq(userMutes.muterId, muterId),
            eq(userMutes.mutedId, mutedId),
          ),
        );
    } catch (error) {
      this.logError('SocialRepository.unmute', error);
      throw error;
    }
  }

  async isMuted(muterId: string, mutedId: string): Promise<boolean> {
    try {
      const rows = await this.db
        .select({ id: userMutes.id })
        .from(userMutes)
        .where(
          and(
            eq(userMutes.muterId, muterId),
            eq(userMutes.mutedId, mutedId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    } catch (error) {
      this.logError('SocialRepository.isMuted', error);
      return false;
    }
  }

  // ── Privacy Settings ───────────────────────────────────────────────────────

  async getPrivacySettings(userId: string): Promise<UserPrivacySettings> {
    this.validateRequired(userId, 'userId');
    try {
      const rows = await this.db
        .select()
        .from(userPrivacySettings)
        .where(eq(userPrivacySettings.userId, userId))
        .limit(1);

      if (rows.length > 0) return rows[0];

      // Ленивое создание настроек по умолчанию
      const defaults = {
        userId,
        profileVisibility: 'public' as const,
        readingStatsVisible: true,
        clubsVisible: true,
        readingHistoryVisible: true,
        allowDmFrom: 'followers' as const,
      };
      await this.db.insert(userPrivacySettings).values(defaults).onConflictDoNothing();
      return { ...defaults, updatedAt: new Date() };
    } catch (error) {
      this.logError('SocialRepository.getPrivacySettings', error);
      // Вернуть безопасные значения по умолчанию при ошибке
      return {
        userId,
        profileVisibility: 'public',
        readingStatsVisible: true,
        clubsVisible: true,
        readingHistoryVisible: true,
        allowDmFrom: 'followers',
        updatedAt: new Date(),
      };
    }
  }

  async updatePrivacySettings(
    userId: string,
    updates: Partial<InsertUserPrivacySettings>,
  ): Promise<UserPrivacySettings> {
    this.validateRequired(userId, 'userId');
    try {
      const rows = await this.db
        .insert(userPrivacySettings)
        .values({
          userId,
          ...updates,
        })
        .onConflictDoUpdate({
          target: userPrivacySettings.userId,
          set: { ...updates, updatedAt: sql`now()` },
        })
        .returning();
      return rows[0];
    } catch (error) {
      this.logError('SocialRepository.updatePrivacySettings', error);
      throw error;
    }
  }

  // ── Access Control ─────────────────────────────────────────────────────────

  /**
   * Проверить, может ли viewer видеть профиль target.
   * null viewer = гость.
   */
  async canViewProfile(viewerId: string | null, targetId: string): Promise<boolean> {
    try {
      const privacy = await this.getPrivacySettings(targetId);

      if (privacy.profileVisibility === 'public') return true;
      if (!viewerId) return false;
      if (viewerId === targetId) return true;

      // Заблокирован — закрыт
      if (await this.isBlockedEither(viewerId, targetId)) return false;

      if (privacy.profileVisibility === 'followers') {
        return this.isFollowing(targetId, viewerId); // target подписан на viewer
      }

      // 'private'
      return false;
    } catch (error) {
      this.logError('SocialRepository.canViewProfile', error);
      return false;
    }
  }

  async canSendDm(senderId: string, recipientId: string): Promise<boolean> {
    try {
      if (senderId === recipientId) return false;
      if (await this.isBlockedEither(senderId, recipientId)) return false;

      const privacy = await this.getPrivacySettings(recipientId);
      if (privacy.allowDmFrom === 'nobody') return false;
      if (privacy.allowDmFrom === 'everyone') return true;

      // 'followers' — получатель должен быть подписан на отправителя
      return this.isFollowing(recipientId, senderId);
    } catch (error) {
      this.logError('SocialRepository.canSendDm', error);
      return false;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async recalcCounters(userId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE user_profiles
      SET
        followers_count = (
          SELECT COUNT(*) FROM user_follows WHERE following_id = ${userId}
        ),
        following_count = (
          SELECT COUNT(*) FROM user_follows WHERE follower_id = ${userId}
        )
      WHERE user_id = ${userId};
    `);
  }
}
