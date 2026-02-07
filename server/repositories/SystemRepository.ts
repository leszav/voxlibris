import { BaseRepository } from './BaseRepository.js';
import { eq, asc } from 'drizzle-orm';
import { 
  systemSettings,
  settings,
  type SystemSetting,
  type Setting,
  type InsertSetting
} from '../../shared/schema.js';

/**
 * Репозиторий для системных настроек
 * Управляет конфигурацией приложения и системными параметрами
 */
export class SystemRepository extends BaseRepository {
  
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
  async updateSystemSetting(key: string, value: any, updatedBy: string): Promise<boolean> {
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
      
      return this.getFirstResult(result);
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
      
      return result;
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
      // Проверяем существование настройки
      const existing = await this.getSetting(setting.key);
      
      if (existing) {
        // Обновляем существующую
        const result = await this.db
          .update(settings)
          .set({
            value: setting.value,
            description: setting.description,
            isEncrypted: setting.isEncrypted,
            updatedBy: setting.updatedBy,
            updatedAt: new Date(),
          })
          .where(eq(settings.key, setting.key))
          .returning();
        
        return result[0];
      } else {
        // Создаем новую
        const result = await this.db
          .insert(settings)
          .values({
            key: setting.key,
            value: setting.value,
            category: setting.category,
            description: setting.description,
            isEncrypted: setting.isEncrypted || false,
            updatedBy: setting.updatedBy,
          })
          .returning();
        
        return result[0];
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
