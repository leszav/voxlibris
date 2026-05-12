import { asc, desc, eq } from 'drizzle-orm';
import {
  achievementBuildingBlocks,
  achievementRewardAssets,
  achievements,
  type Achievement,
  type AchievementBuildingBlock,
  type AchievementIconType,
  type AchievementRewardAsset,
  type AchievementStatus,
} from '../../shared/schema.js';
import { BaseRepository } from './BaseRepository.js';

const ALLOWED_STATUSES = new Set<AchievementStatus>(['draft', 'active', 'archived']);
const ALLOWED_ICON_TYPES = new Set<AchievementIconType>(['badge', 'star', 'title']);
type BuildingBlockValueType = 'number' | 'string' | 'boolean';

export interface BuildingBlockDefinition {
  id: string;
  code: string;
  labelRu: string;
  valueType: BuildingBlockValueType;
  supportedOperators: string[];
  isActive: boolean;
}

export interface AdminBuildingBlockInput {
  code: string;
  labelRu: string;
  valueType: BuildingBlockValueType;
  supportedOperators: string[];
  isActive?: boolean;
}

export interface AdminBuildingBlockPatch {
  labelRu?: string;
  valueType?: BuildingBlockValueType;
  supportedOperators?: string[];
  isActive?: boolean;
}

export interface AdminAchievementInput {
  code: string;
  titleRu: string;
  descriptionRu?: string | null;
  iconType?: AchievementIconType;
  badgeImageUrl?: string | null;
  rewardPayload?: unknown;
  conditionsPayload?: unknown;
  status?: AchievementStatus;
  sortOrder?: number;
}

export interface AdminAchievementPatch {
  titleRu?: string;
  descriptionRu?: string | null;
  iconType?: AchievementIconType;
  badgeImageUrl?: string | null;
  rewardPayload?: unknown;
  conditionsPayload?: unknown;
  status?: AchievementStatus;
  sortOrder?: number;
}

export interface RewardAssetDefinition {
  id: string;
  assetType: AchievementIconType;
  nameRu: string;
  imageUrl: string;
  descriptionRu: string | null;
  groupKey: string;
  tags: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminRewardAssetInput {
  assetType: AchievementIconType;
  nameRu: string;
  imageUrl: string;
  descriptionRu?: string | null;
  groupKey?: string;
  tags?: string[];
  sortOrder?: number;
  isActive?: boolean;
}

export interface AdminRewardAssetPatch {
  assetType?: AchievementIconType;
  nameRu?: string;
  imageUrl?: string;
  descriptionRu?: string | null;
  groupKey?: string;
  tags?: string[];
  sortOrder?: number;
  isActive?: boolean;
}

function sanitizeTitle(value: string): string {
  const title = value.trim();
  if (!title) {
    throw new Error('VALIDATION_ERROR: titleRu is required');
  }
  if (title.length > 120) {
    throw new Error('VALIDATION_ERROR: titleRu max length is 120');
  }
  return title;
}

function sanitizeCode(value: string): string {
  const code = value.trim().toLowerCase();
  if (!code) {
    throw new Error('VALIDATION_ERROR: code is required');
  }
  if (!/^[a-z0-9_.-]{3,100}$/.test(code)) {
    throw new Error('VALIDATION_ERROR: code must match ^[a-z0-9_.-]{3,100}$');
  }
  return code;
}

function sanitizeStatus(value: AchievementStatus = 'draft'): AchievementStatus {
  if (!ALLOWED_STATUSES.has(value)) {
    throw new Error('VALIDATION_ERROR: invalid status');
  }
  return value;
}

function sanitizeIconType(value: AchievementIconType = 'badge'): AchievementIconType {
  if (!ALLOWED_ICON_TYPES.has(value)) {
    throw new Error('VALIDATION_ERROR: invalid iconType');
  }
  return value;
}

function sanitizeSortOrder(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

function sanitizeLabelRu(value: string): string {
  const label = value.trim();
  if (!label) {
    throw new Error('VALIDATION_ERROR: labelRu is required');
  }
  if (label.length > 120) {
    throw new Error('VALIDATION_ERROR: labelRu max length is 120');
  }
  return label;
}

function sanitizeValueType(value: string): BuildingBlockValueType {
  if (value === 'number' || value === 'string' || value === 'boolean') {
    return value;
  }
  throw new Error('VALIDATION_ERROR: valueType must be number|string|boolean');
}

function sanitizeImageUrl(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('VALIDATION_ERROR: imageUrl is required');
  }

  const isDataUrl = normalized.startsWith('data:image/');
  const isHttpUrl = /^https?:\/\//i.test(normalized);
  const isStorageUrl = normalized.startsWith('/api/storage/');
  if (!isDataUrl && !isHttpUrl && !isStorageUrl) {
    throw new TypeError('VALIDATION_ERROR: imageUrl must be http(s) URL, data:image/*, or /api/storage/ URL');
  }

  return normalized;
}

function sanitizeGroupKey(value?: string): string {
  const normalized = (value ?? 'default').trim().toLowerCase();
  if (!normalized) return 'default';
  if (!/^[a-z0-9_.-]{1,80}$/.test(normalized)) {
    throw new Error('VALIDATION_ERROR: groupKey must match ^[a-z0-9_.-]{1,80}$');
  }
  return normalized;
}

function sanitizeTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TypeError('VALIDATION_ERROR: tags must be an array of strings');
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

function sanitizeSupportedOperators(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('VALIDATION_ERROR: supportedOperators must be a non-empty array');
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);

  if (normalized.length === 0) {
    throw new Error('VALIDATION_ERROR: supportedOperators must contain strings');
  }

  return Array.from(new Set(normalized));
}

function ensureJsonObjectOrArray(payload: unknown, fieldName: string): unknown {
  if (payload === undefined || payload === null) return payload;
  if (typeof payload !== 'object') {
    throw new TypeError(`VALIDATION_ERROR: ${fieldName} must be JSON object or array`);
  }
  return payload;
}

export class GamificationRepository extends BaseRepository {
  private mapBlockRow(row: AchievementBuildingBlock): BuildingBlockDefinition {
    const operators = Array.isArray(row.supportedOperators)
      ? row.supportedOperators.filter((item): item is string => typeof item === 'string')
      : [];

    return {
      id: row.id,
      code: row.code,
      labelRu: row.labelRu,
      valueType: row.valueType,
      supportedOperators: operators,
      isActive: row.isActive,
    };
  }

  async listBuildingBlocks(includeInactive = true): Promise<BuildingBlockDefinition[]> {
    const rows = await this.db
      .select()
      .from(achievementBuildingBlocks)
      .where(includeInactive ? undefined : eq(achievementBuildingBlocks.isActive, true))
      .orderBy(asc(achievementBuildingBlocks.code));

    return rows.map((row) => this.mapBlockRow(row));
  }

  async createBuildingBlock(adminId: string, input: AdminBuildingBlockInput): Promise<BuildingBlockDefinition> {
    const rows = await this.db
      .insert(achievementBuildingBlocks)
      .values({
        code: sanitizeCode(input.code),
        labelRu: sanitizeLabelRu(input.labelRu),
        valueType: sanitizeValueType(input.valueType),
        supportedOperators: sanitizeSupportedOperators(input.supportedOperators),
        isActive: input.isActive ?? true,
        createdBy: adminId,
        updatedBy: adminId,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create building block');
    }

    return this.mapBlockRow(rows[0]);
  }

  async updateBuildingBlock(
    adminId: string,
    id: string,
    patch: AdminBuildingBlockPatch,
  ): Promise<BuildingBlockDefinition | null> {
    const setData: Partial<typeof achievementBuildingBlocks.$inferInsert> = {
      updatedBy: adminId,
      updatedAt: new Date(),
    };

    if (patch.labelRu !== undefined) {
      setData.labelRu = sanitizeLabelRu(patch.labelRu);
    }

    if (patch.valueType !== undefined) {
      setData.valueType = sanitizeValueType(patch.valueType);
    }

    if (patch.supportedOperators !== undefined) {
      setData.supportedOperators = sanitizeSupportedOperators(patch.supportedOperators);
    }

    if (patch.isActive !== undefined) {
      setData.isActive = patch.isActive;
    }

    if (Object.keys(setData).length === 2) {
      throw new Error('VALIDATION_ERROR: no fields to update');
    }

    const rows = await this.db
      .update(achievementBuildingBlocks)
      .set(setData)
      .where(eq(achievementBuildingBlocks.id, id))
      .returning();

    return rows[0] ? this.mapBlockRow(rows[0]) : null;
  }

  async deleteBuildingBlock(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(achievementBuildingBlocks)
      .where(eq(achievementBuildingBlocks.id, id))
      .returning({ id: achievementBuildingBlocks.id });

    return rows.length > 0;
  }

  async listAchievements(status?: AchievementStatus): Promise<Achievement[]> {
    if (status && !ALLOWED_STATUSES.has(status)) {
      throw new Error('VALIDATION_ERROR: invalid status');
    }

    const whereClause = status ? eq(achievements.status, status) : undefined;

    return this.db
      .select()
      .from(achievements)
      .where(whereClause)
      .orderBy(asc(achievements.sortOrder), desc(achievements.createdAt));
  }

  async getAchievement(id: string): Promise<Achievement | null> {
    const rows = await this.db
      .select()
      .from(achievements)
      .where(eq(achievements.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async createAchievement(adminId: string, input: AdminAchievementInput): Promise<Achievement> {
    const code = sanitizeCode(input.code);
    const titleRu = sanitizeTitle(input.titleRu);
    const status = sanitizeStatus(input.status);
    const iconType = sanitizeIconType(input.iconType);
    const sortOrder = sanitizeSortOrder(input.sortOrder);

    const conditionsPayload = ensureJsonObjectOrArray(input.conditionsPayload ?? [], 'conditionsPayload');
    const rewardPayload = ensureJsonObjectOrArray(input.rewardPayload ?? null, 'rewardPayload');

    const rows = await this.db
      .insert(achievements)
      .values({
        code,
        titleRu,
        descriptionRu: input.descriptionRu?.trim() || null,
        iconType,
        badgeImageUrl: input.badgeImageUrl?.trim() || null,
        rewardPayload,
        conditionsPayload,
        status,
        sortOrder,
        createdBy: adminId,
        updatedBy: adminId,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create achievement');
    }

    return rows[0];
  }

  async updateAchievement(adminId: string, id: string, patch: AdminAchievementPatch): Promise<Achievement | null> {
    const setData: Partial<typeof achievements.$inferInsert> = {
      updatedBy: adminId,
      updatedAt: new Date(),
    };

    if (patch.titleRu !== undefined) {
      setData.titleRu = sanitizeTitle(patch.titleRu);
    }

    if (patch.descriptionRu !== undefined) {
      setData.descriptionRu = patch.descriptionRu?.trim() || null;
    }

    if (patch.iconType !== undefined) {
      setData.iconType = sanitizeIconType(patch.iconType);
    }

    if (patch.badgeImageUrl !== undefined) {
      setData.badgeImageUrl = patch.badgeImageUrl?.trim() || null;
    }

    if (patch.conditionsPayload !== undefined) {
      setData.conditionsPayload = ensureJsonObjectOrArray(patch.conditionsPayload, 'conditionsPayload');
    }

    if (patch.rewardPayload !== undefined) {
      setData.rewardPayload = ensureJsonObjectOrArray(patch.rewardPayload, 'rewardPayload');
    }

    if (patch.status !== undefined) {
      setData.status = sanitizeStatus(patch.status);
    }

    if (patch.sortOrder !== undefined) {
      setData.sortOrder = sanitizeSortOrder(patch.sortOrder);
    }

    if (Object.keys(setData).length === 2) {
      throw new Error('VALIDATION_ERROR: no fields to update');
    }

    const rows = await this.db
      .update(achievements)
      .set(setData)
      .where(eq(achievements.id, id))
      .returning();

    return rows[0] ?? null;
  }

  async deleteAchievement(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(achievements)
      .where(eq(achievements.id, id))
      .returning({ id: achievements.id });

    return rows.length > 0;
  }

  async updateAchievementStatus(
    adminId: string,
    id: string,
    status: AchievementStatus,
  ): Promise<Achievement | null> {
    const normalizedStatus = sanitizeStatus(status);
    const rows = await this.db
      .update(achievements)
      .set({ status: normalizedStatus, updatedBy: adminId, updatedAt: new Date() })
      .where(eq(achievements.id, id))
      .returning();

    return rows[0] ?? null;
  }

  private mapRewardAssetRow(row: AchievementRewardAsset): RewardAssetDefinition {
    const tags = Array.isArray(row.tags)
      ? row.tags.filter((item): item is string => typeof item === 'string')
      : [];

    return {
      id: row.id,
      assetType: row.assetType,
      nameRu: row.nameRu,
      imageUrl: row.imageUrl,
      descriptionRu: row.descriptionRu,
      groupKey: row.groupKey,
      tags,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listRewardAssets(includeInactive = true): Promise<RewardAssetDefinition[]> {
    const rows = await this.db
      .select()
      .from(achievementRewardAssets)
      .where(includeInactive ? undefined : eq(achievementRewardAssets.isActive, true))
      .orderBy(
        asc(achievementRewardAssets.assetType),
        asc(achievementRewardAssets.groupKey),
        asc(achievementRewardAssets.sortOrder),
        desc(achievementRewardAssets.createdAt),
      );

    return rows.map((row) => this.mapRewardAssetRow(row));
  }

  async createRewardAsset(adminId: string, input: AdminRewardAssetInput): Promise<RewardAssetDefinition> {
    const rows = await this.db
      .insert(achievementRewardAssets)
      .values({
        assetType: sanitizeIconType(input.assetType),
        nameRu: sanitizeLabelRu(input.nameRu),
        imageUrl: sanitizeImageUrl(input.imageUrl),
        descriptionRu: input.descriptionRu?.trim() || null,
        groupKey: sanitizeGroupKey(input.groupKey),
        tags: sanitizeTags(input.tags),
        sortOrder: sanitizeSortOrder(input.sortOrder),
        isActive: input.isActive ?? true,
        createdBy: adminId,
        updatedBy: adminId,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create reward asset');
    }

    return this.mapRewardAssetRow(rows[0]);
  }

  async updateRewardAsset(adminId: string, id: string, patch: AdminRewardAssetPatch): Promise<RewardAssetDefinition | null> {
    const setData: Partial<typeof achievementRewardAssets.$inferInsert> = {
      updatedBy: adminId,
      updatedAt: new Date(),
    };

    if (patch.assetType !== undefined) {
      setData.assetType = sanitizeIconType(patch.assetType);
    }
    if (patch.nameRu !== undefined) {
      setData.nameRu = sanitizeLabelRu(patch.nameRu);
    }
    if (patch.imageUrl !== undefined) {
      setData.imageUrl = sanitizeImageUrl(patch.imageUrl);
    }
    if (patch.descriptionRu !== undefined) {
      setData.descriptionRu = patch.descriptionRu?.trim() || null;
    }
    if (patch.groupKey !== undefined) {
      setData.groupKey = sanitizeGroupKey(patch.groupKey);
    }
    if (patch.tags !== undefined) {
      setData.tags = sanitizeTags(patch.tags);
    }
    if (patch.sortOrder !== undefined) {
      setData.sortOrder = sanitizeSortOrder(patch.sortOrder);
    }
    if (patch.isActive !== undefined) {
      setData.isActive = patch.isActive;
    }

    if (Object.keys(setData).length === 2) {
      throw new Error('VALIDATION_ERROR: no fields to update');
    }

    const rows = await this.db
      .update(achievementRewardAssets)
      .set(setData)
      .where(eq(achievementRewardAssets.id, id))
      .returning();

    return rows[0] ? this.mapRewardAssetRow(rows[0]) : null;
  }

  async deleteRewardAsset(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(achievementRewardAssets)
      .where(eq(achievementRewardAssets.id, id))
      .returning({ id: achievementRewardAssets.id });

    return rows.length > 0;
  }

  async bulkDeleteRewardAssets(ids: string[]): Promise<number> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('VALIDATION_ERROR: ids must be non-empty array');
    }

    let deleted = 0;
    for (const id of ids) {
      const removed = await this.deleteRewardAsset(id);
      if (removed) {
        deleted += 1;
      }
    }

    return deleted;
  }

  async bulkImportRewardAssets(adminId: string, items: AdminRewardAssetInput[]): Promise<RewardAssetDefinition[]> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('VALIDATION_ERROR: items must be non-empty array');
    }

    const created: RewardAssetDefinition[] = [];
    for (const item of items) {
      const asset = await this.createRewardAsset(adminId, item);
      created.push(asset);
    }

    return created;
  }
}
