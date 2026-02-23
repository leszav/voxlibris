import { BaseRepository } from './BaseRepository.js';
import { eq, asc, desc, and, gte, lte, count, sql } from 'drizzle-orm';
import { CryptoService } from '../crypto-service.js';
import { 
  systemSettings,
  settings,
  adminActions,
  type SystemSetting,
  type Setting,
  type InsertSetting,
  type AdminAction,
  type AdminActionType,
  type AdminActionTargetType
} from '../../shared/schema.js';

/**
 * Репозиторий для системных настроек
 * Управляет конфигурацией приложения и системными параметрами
 */
export class SystemRepository extends BaseRepository {
  private readonly encryptedValuePrefix = 'enc:v1:';

  private isLegacyPlaintextEncryptedSetting(setting: Setting): boolean {
    return Boolean(
      setting.isEncrypted &&
      setting.value &&
      !setting.value.startsWith(this.encryptedValuePrefix),
    );
  }

  private async migrateLegacyEncryptedSetting(setting: Setting): Promise<Setting> {
    const encryptedValue = this.encryptSensitiveSettingValue(setting.value ?? null);
    if (!encryptedValue) {
      return setting;
    }

    const result = await this.db
      .update(settings)
      .set({
        value: encryptedValue,
        updatedAt: new Date(),
      })
      .where(eq(settings.key, setting.key))
      .returning();

    return result[0] ?? {
      ...setting,
      value: encryptedValue,
    };
  }

  private encryptSensitiveSettingValue(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (value === '' || value.startsWith(this.encryptedValuePrefix)) {
      return value;
    }

    const encrypted = CryptoService.encryptKey(Buffer.from(value, 'utf8'));
    return `${this.encryptedValuePrefix}${encrypted}`;
  }

  private decryptSensitiveSettingValue(value: string | null | undefined): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (!value.startsWith(this.encryptedValuePrefix)) {
      // Backward compatibility for legacy plaintext values.
      return value;
    }

    try {
      const payload = value.slice(this.encryptedValuePrefix.length);
      return CryptoService.decryptKey(payload).toString('utf8');
    } catch (error) {
      this.logError('decryptSensitiveSettingValue', error);
      throw new Error('Failed to decrypt encrypted setting value');
    }
  }

  private normalizeSettingForRead(setting: Setting): Setting {
    if (!setting.isEncrypted) {
      return setting;
    }

    return {
      ...setting,
      value: this.decryptSensitiveSettingValue(setting.value ?? null),
    };
  }
  
  // ============================================================
  // Admin Action Logs - Логи действий администраторов
  // ============================================================

  /**
   * Получение логов админских действий с фильтрацией и пагинацией
   */
  async getAdminActionLogs(filters: {
    limit: number;
    offset: number;
    action?: string;
    adminId?: string;
    targetType?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<(AdminAction & { adminUsername: string })[]> {
    try {
      const conditions = [];
      
      if (filters.action) {
        conditions.push(eq(adminActions.actionType, filters.action as AdminActionType));
      }
      
      if (filters.adminId) {
        conditions.push(eq(adminActions.adminId, filters.adminId));
      }
      
      if (filters.targetType) {
        conditions.push(eq(adminActions.targetType, filters.targetType as AdminActionTargetType));
      }
      
      if (filters.dateFrom) {
        conditions.push(gte(adminActions.createdAt, new Date(filters.dateFrom)));
      }
      
      if (filters.dateTo) {
        conditions.push(lte(adminActions.createdAt, new Date(filters.dateTo)));
      }
      
      const result = await this.db
        .select({
          id: adminActions.id,
          adminId: adminActions.adminId,
          actionType: adminActions.actionType,
          targetType: adminActions.targetType,
          targetId: adminActions.targetId,
          reason: adminActions.reason,
          previousValue: adminActions.previousValue,
          newValue: adminActions.newValue,
          metadata: adminActions.metadata,
          ipAddress: adminActions.ipAddress,
          userAgent: adminActions.userAgent,
          createdAt: adminActions.createdAt,
          adminUsername: sql`u.username`
        })
        .from(adminActions)
        .leftJoin(sql`users u`, eq(adminActions.adminId, sql`u.id`))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(adminActions.createdAt))
        .limit(filters.limit)
        .offset(filters.offset);
      
      return result as (AdminAction & { adminUsername: string })[];
    } catch (error) {
      this.logError('getAdminActionLogs', error);
      throw error;
    }
  }

  /**
   * Подсчет логов админских действий с фильтрацией
   */
  async getAdminActionLogsCount(filters: {
    action?: string;
    adminId?: string;
    targetType?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<number> {
    try {
      const conditions = [];
      
      if (filters.action) {
        conditions.push(eq(adminActions.actionType, filters.action as AdminActionType));
      }
      
      if (filters.adminId) {
        conditions.push(eq(adminActions.adminId, filters.adminId));
      }
      
      if (filters.targetType) {
        conditions.push(eq(adminActions.targetType, filters.targetType as AdminActionTargetType));
      }
      
      if (filters.dateFrom) {
        conditions.push(gte(adminActions.createdAt, new Date(filters.dateFrom)));
      }
      
      if (filters.dateTo) {
        conditions.push(lte(adminActions.createdAt, new Date(filters.dateTo)));
      }
      
      const result = await this.db
        .select({ count: count() })
        .from(adminActions)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      
      return result[0]?.count || 0;
    } catch (error) {
      this.logError('getAdminActionLogsCount', error);
      throw error;
    }
  }

  /**
   * Получение статистики админских действий за период
   */
  async getAdminActionStats(days: number): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    actionsByAdmin: Record<string, { count: number; username: string }>;
    impersonationCount: number;
    recentActions: (AdminAction & { adminUsername: string })[];
  }> {
    try {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);
      
      // Общее количество действий
      const totalResult = await this.db
        .select({ count: count() })
        .from(adminActions)
        .where(gte(adminActions.createdAt, dateFrom));
      
      // Статистика по типам действий
      const actionTypeStats = await this.db
        .select({
          actionType: adminActions.actionType,
          count: count()
        })
        .from(adminActions)
        .where(gte(adminActions.createdAt, dateFrom))
        .groupBy(adminActions.actionType)
        .orderBy(desc(count()));
      
      // Статистика по админам
      const adminStats = await this.db
        .select({
          adminId: adminActions.adminId,
          adminUsername: sql`u.username`,
          count: count()
        })
        .from(adminActions)
        .leftJoin(sql`users u`, eq(adminActions.adminId, sql`u.id`))
        .where(gte(adminActions.createdAt, dateFrom))
        .groupBy(adminActions.adminId, sql`u.username`)
        .orderBy(desc(count()));
      
      // Количество имперсонаций
      const impersonationResult = await this.db
        .select({ count: count() })
        .from(adminActions)
        .where(
          and(
            eq(adminActions.actionType, 'impersonate'),
            gte(adminActions.createdAt, dateFrom)
          )
        );
      
      // Последние действия
      const recentActions = await this.getAdminActionLogs({
        limit: 10,
        offset: 0,
        dateFrom: dateFrom.toISOString()
      });
      
      return {
        totalActions: totalResult[0]?.count || 0,
        actionsByType: Object.fromEntries(
          actionTypeStats.map(s => [s.actionType, s.count])
        ),
        actionsByAdmin: Object.fromEntries(
          adminStats.map(s => [
            s.adminId, 
            { count: s.count, username: s.adminUsername as string }
          ])
        ),
        impersonationCount: impersonationResult[0]?.count || 0,
        recentActions
      };
    } catch (error) {
      this.logError('getAdminActionStats', error);
      throw error;
    }
  }

  // ============================================================
  // System Settings - Системные настройки
  // ============================================================

  /**
   * Получение системных настроек по категории
   */
  async getSystemSettings(category?: string): Promise<SystemSetting[]> {
    try {
      if (category) {
        return this.db.select().from(systemSettings).where(eq(systemSettings.category, category));
      }
      return this.db.select().from(systemSettings);
    } catch (error) {
      this.logError('getSystemSettings', error);
      throw new Error('Failed to get system settings');
    }
  }

  /**
   * Получение конкретной системной настройки
   */
  async getSystemSetting(key: string): Promise<SystemSetting | null> {
    try {
      const result = await this.db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .limit(1);

      return this.getFirstResult(result) || null;
    } catch (error) {
      this.logError('getSystemSetting', error);
      throw new Error('Failed to get system setting');
    }
  }

  /**
   * Обновление системной настройки
   */
  async updateSystemSetting(key: string, value: unknown, updatedBy: string): Promise<boolean> {
    try {
      // Получаем текущую настройку для определения типа
      const currentSetting = await this.getSystemSetting(key);
      if (!currentSetting) {
        throw new Error('System setting not found');
      }

      // Сериализуем значение в зависимости от типа
      let serializedValue: string;
      switch (currentSetting.type) {
        case 'boolean':
          serializedValue = Boolean(value).toString();
          break;
        case 'number':
          serializedValue = Number(value).toString();
          break;
        case 'json':
          serializedValue = JSON.stringify(value);
          break;
        default:
          serializedValue = String(value);
      }

      const result = await this.db
        .update(systemSettings)
        .set({
          value: serializedValue,
          updatedBy,
          updatedAt: new Date()
        })
        .where(eq(systemSettings.key, key))
        .returning();

      return result.length > 0;
    } catch (error) {
      this.logError('updateSystemSetting', error);
      throw new Error('Failed to update system setting');
    }
  }

  // ============================================================
  // Application Settings - Настройки приложения (SMTP и др.)
  // ============================================================

  /**
   * Получение настройки приложения
   */
  async getSetting(key: string): Promise<Setting | undefined> {
    try {
      const result = await this.db
        .select()
        .from(settings)
        .where(eq(settings.key, key))
        .limit(1);
      
      let setting = this.getFirstResult(result);
      if (!setting) {
        return undefined;
      }

      if (this.isLegacyPlaintextEncryptedSetting(setting)) {
        setting = await this.migrateLegacyEncryptedSetting(setting);
      }

      return this.normalizeSettingForRead(setting);
    } catch (error) {
      this.logError('getSetting', error);
      throw new Error('Failed to get setting');
    }
  }

  /**
   * Получение настроек по категории
   */
  async getSettingsByCategory(category: string): Promise<Setting[]> {
    try {
      const result = await this.db
        .select()
        .from(settings)
        .where(eq(settings.category, category))
        .orderBy(asc(settings.key));

      const normalizedSettings: Setting[] = [];

      for (const originalSetting of result) {
        let setting = originalSetting;
        if (this.isLegacyPlaintextEncryptedSetting(setting)) {
          setting = await this.migrateLegacyEncryptedSetting(setting);
        }
        normalizedSettings.push(this.normalizeSettingForRead(setting));
      }

      return normalizedSettings;
    } catch (error) {
      this.logError('getSettingsByCategory', error);
      throw new Error('Failed to get settings by category');
    }
  }

  /**
   * Установка настройки приложения
   */
  async setSetting(setting: InsertSetting & { updatedBy: string }): Promise<Setting> {
    try {
      const normalizedValue = setting.isEncrypted
        ? this.encryptSensitiveSettingValue(setting.value ?? null)
        : (setting.value ?? null);

      // Проверяем существование настройки
      const existing = await this.getSetting(setting.key);
      
      if (existing) {
        // Обновляем существующую
        const result = await this.db
          .update(settings)
          .set({
            value: normalizedValue,
            description: setting.description,
            isEncrypted: setting.isEncrypted,
            updatedBy: setting.updatedBy,
            updatedAt: new Date(),
          })
          .where(eq(settings.key, setting.key))
          .returning();
        
        return this.normalizeSettingForRead(result[0]);
      } else {
        // Создаем новую
        const result = await this.db
          .insert(settings)
          .values({
            key: setting.key,
            value: normalizedValue,
            category: setting.category,
            description: setting.description,
            isEncrypted: setting.isEncrypted || false,
            updatedBy: setting.updatedBy,
          })
          .returning();
        
        return this.normalizeSettingForRead(result[0]);
      }
    } catch (error) {
      this.logError('setSetting', error);
      throw new Error('Failed to set setting');
    }
  }

  /**
   * Удаление настройки приложения
   */
  async deleteSetting(key: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(settings)
        .where(eq(settings.key, key))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      this.logError('deleteSetting', error);
      throw new Error('Failed to delete setting');
    }
  }
}
