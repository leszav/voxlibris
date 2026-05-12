import { and, asc, count, eq, sql } from 'drizzle-orm';
import {
  achievements,
  bookReadingStatus,
  directMessages,
  notes,
  sessionListeners,
  userAchievements,
  userActivityCounters,
  userProfiles,
  userStreaks,
  users,
  type Achievement,
} from '../../shared/schema.js';
import { logger } from '../lib/logger.js';
import { getIO } from '../lib/socket-registry.js';
import { getDbConnection } from '../repositories/BaseRepository.js';
import { activityService } from './activity-service.js';

type ConditionValueType = 'number' | 'string' | 'boolean';
type ConditionsLogic = 'AND' | 'OR';
type ConditionScalar = boolean | number | string | string[] | null;

interface AchievementCondition {
  blockCode: string;
  operator: string;
  valueType: ConditionValueType;
  value: unknown;
}

interface AchievementConditionsPayload {
  logic: ConditionsLogic;
  items: AchievementCondition[];
}

interface UserGamificationSnapshot {
  userId: string;
  registeredAt: Date;
  completedBooksCount: number;
  sentDmCount: number;
  notesCreatedCount: number;
  followingCount: number;
  followersCount: number;
  clubSessionsJoinedCount: number;
  currentStreakDays: number;
  bestStreakDays: number;
  profileCompleted: boolean;
  favoriteGenres: string[];
}

export interface AwardedAchievementSummary {
  achievementId: string;
  code: string;
  titleRu: string;
  iconType: Achievement['iconType'];
  badgeImageUrl: string | null;
}

export interface CheckAndAwardResult {
  checked: number;
  awarded: AwardedAchievementSummary[];
}

export interface UserStreakSummary {
  currentStreakDays: number;
  bestStreakDays: number;
  lastActiveDate: string | null;
}

export interface ReconcileGamificationOptions {
  batchSize?: number;
  maxUsers?: number;
  reason?: string;
}

export interface ReconcileGamificationSummary {
  processedUsers: number;
  checkedAchievements: number;
  awardedCount: number;
  failedUsers: number;
}

interface NormalizedReconcileOptions {
  batchSize: number;
  maxUsers: number | null;
  reason: string;
}

interface LiveActivityCounters {
  completedBooksCount: number;
  sentDmCount: number;
  clubSessionsJoinedCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }

  return Boolean(value);
}

function coerceString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function normalizeExpectedValue(valueType: ConditionValueType, rawValue: unknown): ConditionScalar | string[] {
  if (valueType === 'number') {
    return coerceNumber(rawValue);
  }

  if (valueType === 'boolean') {
    return coerceBoolean(rawValue);
  }

  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => coerceString(item)).filter(Boolean);
  }

  const normalized = coerceString(rawValue);
  if (normalized.includes(',')) {
    return normalized.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return normalized;
}

function parseConditionsPayload(payload: unknown): AchievementConditionsPayload {
  const fallback: AchievementConditionsPayload = { logic: 'AND', items: [] };

  if (Array.isArray(payload)) {
    return {
      logic: 'AND',
      items: payload.flatMap((item) => (isRecord(item) ? [parseCondition(item)] : [])),
    };
  }

  if (!isRecord(payload)) {
    return fallback;
  }

  const logic: ConditionsLogic = payload.logic === 'OR' ? 'OR' : 'AND';
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  return {
    logic,
    items: rawItems.flatMap((item) => (isRecord(item) ? [parseCondition(item)] : [])),
  };
}

function parseCondition(raw: Record<string, unknown>): AchievementCondition {
  return {
    blockCode: typeof raw.blockCode === 'string' ? raw.blockCode : '',
    operator: typeof raw.operator === 'string' ? raw.operator.trim().toUpperCase() : '=',
    valueType:
      raw.valueType === 'string' || raw.valueType === 'boolean'
        ? raw.valueType
        : 'number',
    value: raw.value,
  };
}

function parseFavoriteGenres(rawValue: string | null): string[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  } catch {
    // ignore invalid JSON and fall back to plain text
  }

  return rawValue
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isProfileCompleted(profile: {
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  favoriteGenres: string | null;
} | null): boolean {
  if (!profile) {
    return false;
  }

  const hasDisplayName = Boolean(profile.displayName?.trim());
  const hasAvatar = Boolean(profile.avatar?.trim());
  const hasBio = Boolean(profile.bio?.trim());
  const hasGenres = parseFavoriteGenres(profile.favoriteGenres).length > 0;

  return hasDisplayName && hasAvatar && hasBio && hasGenres;
}

function daysSince(date: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const diff = Date.now() - date.getTime();
  return diff <= 0 ? 0 : Math.floor(diff / millisecondsPerDay);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toPreviousDateKey(dateKey: string): string {
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() - 1);
  return toDateKey(base);
}

function compareCondition(actualValue: ConditionScalar, operator: string, expectedValue: ConditionScalar | string[]): boolean {
  if (operator === 'CONTAINS' || operator === 'NOT CONTAINS') {
    return compareContains(actualValue, expectedValue, operator === 'CONTAINS');
  }

  if (operator === 'STARTS WITH') {
    return compareStartsWith(actualValue, expectedValue);
  }

  if (operator === 'ENDS WITH') {
    return compareEndsWith(actualValue, expectedValue);
  }

  if (operator === 'IN' || operator === 'NOT IN') {
    return compareMembership(actualValue, expectedValue, operator === 'IN');
  }

  if (operator === '>' || operator === '<' || operator === '>=' || operator === '<=') {
    return compareNumeric(actualValue, expectedValue, operator);
  }

  if (operator === '!=') {
    return compareEquality(actualValue, expectedValue) === false;
  }

  return compareEquality(actualValue, expectedValue);
}

function compareEquality(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[]): boolean {
  if (Array.isArray(actualValue)) {
    const actualItems = actualValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean);
    if (actualItems.length === 0) {
      return false;
    }

    if (Array.isArray(expectedValue)) {
      const expectedItems = new Set(expectedValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean));
      return actualItems.some((item) => expectedItems.has(item));
    }

    if (typeof expectedValue === 'string') {
      const normalizedExpected = coerceString(expectedValue).toLowerCase();
      return actualItems.some((item) => matchesStringWithWildcard(item, normalizedExpected));
    }

    return false;
  }

  if (Array.isArray(expectedValue)) {
    const actual = coerceString(actualValue).toLowerCase();
    return expectedValue
      .map((item) => coerceString(item).toLowerCase())
      .some((item) => matchesStringWithWildcard(actual, item));
  }

  if (typeof expectedValue === 'number') {
    return coerceNumber(actualValue) === expectedValue;
  }

  if (typeof expectedValue === 'boolean') {
    return coerceBoolean(actualValue) === expectedValue;
  }

  const actual = coerceString(actualValue).toLowerCase();
  const expected = coerceString(expectedValue).toLowerCase();
  return matchesStringWithWildcard(actual, expected);
}

function compareMembership(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[], isPositive: boolean): boolean {
  const expectedItems = Array.isArray(expectedValue)
    ? expectedValue.map((item) => coerceString(item).toLowerCase())
    : [coerceString(expectedValue).toLowerCase()].filter(Boolean);
  const actualItems = Array.isArray(actualValue)
    ? actualValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(actualValue).toLowerCase()].filter(Boolean);

  const contains = actualItems.some((actual) => expectedItems.some((expected) => matchesStringWithWildcard(actual, expected)));
  return isPositive ? contains : !contains;
}

function matchesStringWithWildcard(actual: string, expected: string): boolean {
  if (!expected) {
    return false;
  }

  if (expected === '*') {
    return actual.length > 0;
  }

  if (expected.includes('*')) {
    const regexEscapePrefix = String.raw`\\`;
    const escaped = expected
      .split('*')
      .map((part) => {
        let value = part;
        const regexSpecialChars = ['\\', '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']'];
        for (const specialChar of regexSpecialChars) {
          value = value.replaceAll(specialChar, `${regexEscapePrefix}${specialChar}`);
        }
        return value;
      })
      .join('.*');
    const wildcardRegex = new RegExp(`^${escaped}$`, 'i');
    return wildcardRegex.test(actual);
  }

  return actual === expected;
}

function compareContains(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[], isPositive: boolean): boolean {
  const expectedItems = Array.isArray(expectedValue)
    ? expectedValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(expectedValue).toLowerCase()].filter(Boolean);
  const actualItems = Array.isArray(actualValue)
    ? actualValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(actualValue).toLowerCase()].filter(Boolean);

  const contains = actualItems.some((actual) => expectedItems.some((expected) => actual.includes(expected)));
  return isPositive ? contains : !contains;
}

function compareStartsWith(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[]): boolean {
  const expectedItems = Array.isArray(expectedValue)
    ? expectedValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(expectedValue).toLowerCase()].filter(Boolean);
  const actualItems = Array.isArray(actualValue)
    ? actualValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(actualValue).toLowerCase()].filter(Boolean);

  return actualItems.some((actual) => expectedItems.some((expected) => actual.startsWith(expected)));
}

function compareEndsWith(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[]): boolean {
  const expectedItems = Array.isArray(expectedValue)
    ? expectedValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(expectedValue).toLowerCase()].filter(Boolean);
  const actualItems = Array.isArray(actualValue)
    ? actualValue.map((item) => coerceString(item).toLowerCase()).filter(Boolean)
    : [coerceString(actualValue).toLowerCase()].filter(Boolean);

  return actualItems.some((actual) => expectedItems.some((expected) => actual.endsWith(expected)));
}

function compareNumeric(actualValue: ConditionScalar, expectedValue: ConditionScalar | string[], operator: '>' | '<' | '>=' | '<='): boolean {
  const actual = coerceNumber(actualValue);
  const expected = Array.isArray(expectedValue) ? null : coerceNumber(expectedValue);
  if (actual === null || expected === null) {
    return false;
  }

  if (operator === '>') return actual > expected;
  if (operator === '<') return actual < expected;
  if (operator === '>=') return actual >= expected;
  return actual <= expected;
}

export class GamificationService {
  private readonly db = getDbConnection();

  private normalizeReconcileOptions(options: ReconcileGamificationOptions): NormalizedReconcileOptions {
    const parsedBatchSize = Number(options.batchSize);
    const parsedMaxUsers = Number(options.maxUsers);

    const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0
      ? Math.min(Math.trunc(parsedBatchSize), 500)
      : 100;
    const maxUsers = Number.isFinite(parsedMaxUsers) && parsedMaxUsers > 0
      ? Math.trunc(parsedMaxUsers)
      : null;
    const reason = typeof options.reason === 'string' && options.reason.trim().length > 0
      ? options.reason.trim()
      : 'reconcile_batch';

    return { batchSize, maxUsers, reason };
  }

  private async processReconcileUser(
    userId: string,
    reason: string,
    summary: ReconcileGamificationSummary,
  ): Promise<void> {
    try {
      const result = await this.syncUserStateAndAward(userId, reason);
      summary.processedUsers += 1;
      summary.checkedAchievements += result.checked;
      summary.awardedCount += result.awarded.length;
    } catch (error) {
      summary.failedUsers += 1;
      logger.warn({ err: error, userId }, '[gamification] reconcile user failed');
    }
  }

  async recordUserActivityAndAward(userId: string, reason = 'activity_event', activityAt = new Date()): Promise<CheckAndAwardResult> {
    await this.markUserActive(userId, activityAt);
    return this.syncUserStateAndAward(userId, reason);
  }

  async syncUserStateAndAward(userId: string, reason = 'manual_sync'): Promise<CheckAndAwardResult> {
    await this.syncUserActivityCounters(userId);
    return this.checkAndAward(userId, reason);
  }

  async reconcileUsers(options: ReconcileGamificationOptions = {}): Promise<ReconcileGamificationSummary> {
    const { batchSize, maxUsers, reason } = this.normalizeReconcileOptions(options);
    const summary: ReconcileGamificationSummary = {
      processedUsers: 0,
      checkedAchievements: 0,
      awardedCount: 0,
      failedUsers: 0,
    };
    let offset = 0;

    while (true) {
      const remaining = maxUsers === null ? batchSize : Math.max(maxUsers - summary.processedUsers, 0);
      if (remaining === 0) {
        break;
      }

      const currentBatchSize = Math.min(batchSize, remaining);
      const userRows = await this.db
        .select({ id: users.id })
        .from(users)
        .orderBy(asc(users.createdAt), asc(users.id))
        .limit(currentBatchSize)
        .offset(offset);

      if (userRows.length === 0) {
        break;
      }

      for (const row of userRows) {
        await this.processReconcileUser(row.id, reason, summary);
      }

      offset += userRows.length;
    }

    return summary;
  }

  async markUserActive(userId: string, activityAt = new Date()): Promise<UserStreakSummary> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new Error('VALIDATION_ERROR: userId is required');
    }

    const today = toDateKey(activityAt);
    const yesterday = toPreviousDateKey(today);
    const existingRows = await this.db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, normalizedUserId))
      .limit(1);

    const existing = existingRows[0] ?? null;
    if (!existing) {
      const insertedRows = await this.db
        .insert(userStreaks)
        .values({
          userId: normalizedUserId,
          currentStreakDays: 1,
          bestStreakDays: 1,
          lastActiveDate: today,
          updatedAt: new Date(),
        })
        .returning();

      const inserted = insertedRows[0];
      return {
        currentStreakDays: inserted?.currentStreakDays ?? 1,
        bestStreakDays: inserted?.bestStreakDays ?? 1,
        lastActiveDate: inserted?.lastActiveDate ?? today,
      };
    }

    if (existing.lastActiveDate === today) {
      return {
        currentStreakDays: existing.currentStreakDays,
        bestStreakDays: existing.bestStreakDays,
        lastActiveDate: existing.lastActiveDate,
      };
    }

    const nextCurrent = existing.lastActiveDate === yesterday
      ? existing.currentStreakDays + 1
      : 1;
    const nextBest = Math.max(existing.bestStreakDays, nextCurrent);

    await this.db
      .update(userStreaks)
      .set({
        currentStreakDays: nextCurrent,
        bestStreakDays: nextBest,
        lastActiveDate: today,
        updatedAt: new Date(),
      })
      .where(eq(userStreaks.userId, normalizedUserId));

    return {
      currentStreakDays: nextCurrent,
      bestStreakDays: nextBest,
      lastActiveDate: today,
    };
  }

  async checkStreaksDaily(now = new Date()): Promise<number> {
    const today = toDateKey(now);
    const yesterday = toPreviousDateKey(today);

    const staleRows = await this.db
      .select({ userId: userStreaks.userId })
      .from(userStreaks)
      .where(sql`${userStreaks.currentStreakDays} > 0 AND (${userStreaks.lastActiveDate} IS NULL OR ${userStreaks.lastActiveDate} < ${yesterday})`);

    if (staleRows.length === 0) {
      return 0;
    }

    await this.db
      .update(userStreaks)
      .set({
        currentStreakDays: 0,
        updatedAt: new Date(),
      })
      .where(sql`${userStreaks.currentStreakDays} > 0 AND (${userStreaks.lastActiveDate} IS NULL OR ${userStreaks.lastActiveDate} < ${yesterday})`);

    return staleRows.length;
  }

  async checkAndAward(userId: string, reason = 'manual_check'): Promise<CheckAndAwardResult> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new Error('VALIDATION_ERROR: userId is required');
    }

    const activeAchievements = await this.db
      .select()
      .from(achievements)
      .where(eq(achievements.status, 'active'))
      .orderBy(asc(achievements.sortOrder), asc(achievements.createdAt));

    if (activeAchievements.length === 0) {
      return { checked: 0, awarded: [] };
    }

    const snapshot = await this.getUserSnapshot(normalizedUserId);
    const existingAwards = await this.db
      .select({ achievementId: userAchievements.achievementId })
      .from(userAchievements)
      .where(eq(userAchievements.userId, normalizedUserId));

    const awardedIds = new Set(existingAwards.map((item) => item.achievementId));
    const awarded: AwardedAchievementSummary[] = [];

    for (const achievement of activeAchievements) {
      if (awardedIds.has(achievement.id)) {
        continue;
      }

      if (!this.evaluateAchievement(achievement, snapshot)) {
        continue;
      }

      await this.db.insert(userAchievements).values({
        userId: normalizedUserId,
        achievementId: achievement.id,
        meta: {
          source: 'gamification-service',
          reason,
          awardedAt: new Date().toISOString(),
        },
      });

      awardedIds.add(achievement.id);

      const summary: AwardedAchievementSummary = {
        achievementId: achievement.id,
        code: achievement.code,
        titleRu: achievement.titleRu,
        iconType: achievement.iconType,
        badgeImageUrl: achievement.badgeImageUrl,
      };
      awarded.push(summary);

      try {
        await activityService.emitAchievementUnlocked({
          actorId: normalizedUserId,
          achievementId: achievement.id,
          achievementName: achievement.titleRu,
          achievementIcon: achievement.badgeImageUrl ?? undefined,
        });
      } catch (error) {
        logger.warn({ err: error, achievementId: achievement.id, userId: normalizedUserId }, '[gamification] emit achievement activity failed');
      }

      try {
        const io = getIO();
        io.to(`user:${normalizedUserId}`).emit('achievement:unlocked', {
          achievementId: achievement.id,
          code: achievement.code,
          titleRu: achievement.titleRu,
          iconType: achievement.iconType,
          badgeImageUrl: achievement.badgeImageUrl,
          awardedAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.warn({ err: error, achievementId: achievement.id, userId: normalizedUserId }, '[gamification] socket emit failed');
      }
    }

    return {
      checked: activeAchievements.length,
      awarded,
    };
  }

  async syncUserActivityCounters(userId: string): Promise<void> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new Error('VALIDATION_ERROR: userId is required');
    }

    const [completedBooksRow, sentDmRow, notesRow, joinedSessionsRow, profileRow] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(bookReadingStatus)
        .where(and(eq(bookReadingStatus.userId, normalizedUserId), eq(bookReadingStatus.status, 'completed'))),
      this.db
        .select({ count: count() })
        .from(directMessages)
        .where(eq(directMessages.senderId, normalizedUserId)),
      this.db
        .select({ count: count() })
        .from(notes)
        .where(eq(notes.userId, normalizedUserId)),
      this.db
        .select({ count: sql<number>`COUNT(DISTINCT ${sessionListeners.sessionId})` })
        .from(sessionListeners)
        .where(eq(sessionListeners.listenerId, normalizedUserId)),
      this.db
        .select({
          followersCount: userProfiles.followersCount,
          followingCount: userProfiles.followingCount,
        })
        .from(userProfiles)
        .where(eq(userProfiles.userId, normalizedUserId))
        .limit(1),
    ]);

    const completedBooksCount = completedBooksRow[0]?.count ?? 0;
    const sentDmCount = sentDmRow[0]?.count ?? 0;
    const notesCreatedCount = notesRow[0]?.count ?? 0;
    const clubSessionsJoinedCount = joinedSessionsRow[0]?.count ?? 0;
    const profile = profileRow[0];

    await this.db
      .insert(userActivityCounters)
      .values({
        userId: normalizedUserId,
        completedBooksCount,
        sentDmCount,
        followingCountSnapshot: profile?.followingCount ?? 0,
        followersCountSnapshot: profile?.followersCount ?? 0,
        clubSessionsJoinedCount,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userActivityCounters.userId,
        set: {
          completedBooksCount,
          sentDmCount,
          followingCountSnapshot: profile?.followingCount ?? 0,
          followersCountSnapshot: profile?.followersCount ?? 0,
          clubSessionsJoinedCount,
          updatedAt: new Date(),
        },
      });

    logger.debug({
      userId: normalizedUserId,
      completedBooksCount,
      sentDmCount,
      clubSessionsJoinedCount,
      notesCreatedCount,
    }, '[gamification] counters synced');
  }

  private evaluateAchievement(achievement: Achievement, snapshot: UserGamificationSnapshot): boolean {
    const parsed = parseConditionsPayload(achievement.conditionsPayload);
    if (parsed.items.length === 0) {
      return false;
    }

    const results = parsed.items.map((condition) => {
      const actualValue = this.resolveBlockValue(condition.blockCode, snapshot);
      const expectedValue = normalizeExpectedValue(condition.valueType, condition.value);
      return compareCondition(actualValue, condition.operator, expectedValue);
    });

    return parsed.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  }

  private resolveBlockValue(blockCode: string, snapshot: UserGamificationSnapshot): ConditionScalar {
    switch (blockCode) {
      case 'tenure_days':
        return daysSince(snapshot.registeredAt);
      case 'completed_books':
        return snapshot.completedBooksCount;
      case 'current_streak_days':
        return snapshot.currentStreakDays;
      case 'sent_dm_count':
        return snapshot.sentDmCount;
      case 'following_count':
        return snapshot.followingCount;
      case 'followers_count':
        return snapshot.followersCount;
      case 'club_sessions_joined':
        return snapshot.clubSessionsJoinedCount;
      case 'notes_created_count':
        return snapshot.notesCreatedCount;
      case 'profile_completed':
        return snapshot.profileCompleted;
      case 'favorite_genre':
        return snapshot.favoriteGenres;
      default:
        return null;
    }
  }

  private async getUserSnapshot(userId: string): Promise<UserGamificationSnapshot> {
    const [userRow, profileRow, countersRow, streakRow] = await Promise.all([
      this.db
        .select({ createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      this.db
        .select({
          displayName: userProfiles.displayName,
          avatar: userProfiles.avatar,
          bio: userProfiles.bio,
          favoriteGenres: userProfiles.favoriteGenres,
          followersCount: userProfiles.followersCount,
          followingCount: userProfiles.followingCount,
        })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1),
      this.db
        .select()
        .from(userActivityCounters)
        .where(eq(userActivityCounters.userId, userId))
        .limit(1),
      this.db
        .select()
        .from(userStreaks)
        .where(eq(userStreaks.userId, userId))
        .limit(1),
    ]);

    const user = userRow[0];
    if (!user) {
      throw new Error('NOT_FOUND: user not found');
    }

    const profile = profileRow[0] ?? null;
    const counters = countersRow[0] ?? null;
    const streak = streakRow[0] ?? null;
    const liveCounters = counters ? null : await this.getLiveActivityCounters(userId);

    return {
      userId,
      registeredAt: user.createdAt,
      completedBooksCount: counters?.completedBooksCount ?? liveCounters?.completedBooksCount ?? 0,
      sentDmCount: counters?.sentDmCount ?? liveCounters?.sentDmCount ?? 0,
      followingCount: counters?.followingCountSnapshot ?? profile?.followingCount ?? 0,
      followersCount: counters?.followersCountSnapshot ?? profile?.followersCount ?? 0,
      clubSessionsJoinedCount: counters?.clubSessionsJoinedCount ?? liveCounters?.clubSessionsJoinedCount ?? 0,
      notesCreatedCount: await this.getNotesCount(userId),
      currentStreakDays: streak?.currentStreakDays ?? 0,
      bestStreakDays: streak?.bestStreakDays ?? 0,
      profileCompleted: isProfileCompleted(profile),
      favoriteGenres: parseFavoriteGenres(profile?.favoriteGenres ?? null),
    };
  }

  private async getNotesCount(userId: string): Promise<number> {
    const rows = await this.db
      .select({ count: count() })
      .from(notes)
      .where(eq(notes.userId, userId));

    return rows[0]?.count ?? 0;
  }

  private async getLiveActivityCounters(userId: string): Promise<LiveActivityCounters> {
    const [completedBooksRow, sentDmRow, joinedSessionsRow] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(bookReadingStatus)
        .where(and(eq(bookReadingStatus.userId, userId), eq(bookReadingStatus.status, 'completed'))),
      this.db
        .select({ count: count() })
        .from(directMessages)
        .where(eq(directMessages.senderId, userId)),
      this.db
        .select({ count: sql<number>`COUNT(DISTINCT ${sessionListeners.sessionId})` })
        .from(sessionListeners)
        .where(eq(sessionListeners.listenerId, userId)),
    ]);

    return {
      completedBooksCount: completedBooksRow[0]?.count ?? 0,
      sentDmCount: sentDmRow[0]?.count ?? 0,
      clubSessionsJoinedCount: joinedSessionsRow[0]?.count ?? 0,
    };
  }

  async listAwardedAchievements(userId: string): Promise<AwardedAchievementSummary[]> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new Error('VALIDATION_ERROR: userId is required');
    }

    const rows = await this.db
      .select({
        achievementId: achievements.id,
        code: achievements.code,
        titleRu: achievements.titleRu,
        iconType: achievements.iconType,
        badgeImageUrl: achievements.badgeImageUrl,
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(eq(userAchievements.userId, normalizedUserId))
      .orderBy(asc(achievements.sortOrder), asc(achievements.createdAt));

    return rows;
  }

  async getUserStreak(userId: string): Promise<UserStreakSummary> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new Error('VALIDATION_ERROR: userId is required');
    }

    const rows = await this.db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, normalizedUserId))
      .limit(1);

    const streak = rows[0];
    if (!streak) {
      return {
        currentStreakDays: 0,
        bestStreakDays: 0,
        lastActiveDate: null,
      };
    }

    return {
      currentStreakDays: streak.currentStreakDays,
      bestStreakDays: streak.bestStreakDays,
      lastActiveDate: streak.lastActiveDate,
    };
  }

  async hasAchievement(userId: string, achievementId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: userAchievements.id })
      .from(userAchievements)
      .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, achievementId)))
      .limit(1);

    return rows.length > 0;
  }
}

export const gamificationService = new GamificationService();