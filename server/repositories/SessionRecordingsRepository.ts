import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc } from 'drizzle-orm';
import { sessionRecordings, type SessionRecording, type InsertSessionRecording } from '../../shared/schema.js';

/**
 * Репозиторий для записей сессий чтения
 */
export class SessionRecordingsRepository extends BaseRepository {

  /**
   * Создать запись
   */
  async createRecording(recording: InsertSessionRecording & { sessionId: string; clubId: string }): Promise<SessionRecording> {
    try {
      const result = await this.db
        .insert(sessionRecordings)
        .values(recording)
        .returning();
      return result[0];
    } catch (error) {
      this.logError('createRecording', error);
      throw new Error('Failed to create recording');
    }
  }

  /**
   * Получить запись по ID
   */
  async getRecording(id: string): Promise<SessionRecording | undefined> {
    try {
      const result = await this.db
        .select()
        .from(sessionRecordings)
        .where(eq(sessionRecordings.id, id))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getRecording', error);
      throw new Error('Failed to get recording');
    }
  }

  /**
   * Получить записи сессии
   */
  async getSessionRecordings(sessionId: string): Promise<SessionRecording[]> {
    try {
      return await this.db
        .select()
        .from(sessionRecordings)
        .where(eq(sessionRecordings.sessionId, sessionId))
        .orderBy(desc(sessionRecordings.createdAt));
    } catch (error) {
      this.logError('getSessionRecordings', error);
      throw new Error('Failed to get session recordings');
    }
  }

  /**
   * Получить записи клуба
   */
  async getClubRecordings(clubId: string): Promise<SessionRecording[]> {
    try {
      return await this.db
        .select()
        .from(sessionRecordings)
        .where(eq(sessionRecordings.clubId, clubId))
        .orderBy(desc(sessionRecordings.createdAt));
    } catch (error) {
      this.logError('getClubRecordings', error);
      throw new Error('Failed to get club recordings');
    }
  }

  /**
   * Получить доступные записи клуба
   */
  async getAvailableClubRecordings(clubId: string): Promise<SessionRecording[]> {
    try {
      return await this.db
        .select()
        .from(sessionRecordings)
        .where(and(
          eq(sessionRecordings.clubId, clubId),
          eq(sessionRecordings.isAvailable, true)
        ))
        .orderBy(desc(sessionRecordings.createdAt));
    } catch (error) {
      this.logError('getAvailableClubRecordings', error);
      throw new Error('Failed to get available club recordings');
    }
  }

  /**
   * Получить записи по статусу
   */
  async getRecordingsByStatus(status: 'processing' | 'ready' | 'failed' | 'deleted'): Promise<SessionRecording[]> {
    try {
      return await this.db
        .select()
        .from(sessionRecordings)
        .where(eq(sessionRecordings.status, status))
        .orderBy(desc(sessionRecordings.createdAt));
    } catch (error) {
      this.logError('getRecordingsByStatus', error);
      throw new Error('Failed to get recordings by status');
    }
  }

  /**
   * Обновить статус записи
   */
  async updateRecordingStatus(
    id: string,
    status: 'processing' | 'ready' | 'failed' | 'deleted'
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(sessionRecordings)
        .set({
          status,
          updatedAt: new Date()
        })
        .where(eq(sessionRecordings.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateRecordingStatus', error);
      throw new Error('Failed to update recording status');
    }
  }

  /**
   * Обновить URL записи
   */
  async updateRecordingUrl(
    id: string,
    recordingUrl: string,
    storageKey: string,
    duration?: number,
    fileSize?: number
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(sessionRecordings)
        .set({
          recordingUrl,
          storageKey,
          duration,
          fileSize,
          status: 'ready',
          updatedAt: new Date()
        })
        .where(eq(sessionRecordings.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateRecordingUrl', error);
      throw new Error('Failed to update recording URL');
    }
  }

  /**
   * Обновить качество записи
   */
  async updateRecordingQuality(
    id: string,
    bitrate?: number,
    sampleRate?: number,
    channels?: number
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(sessionRecordings)
        .set({
          bitrate,
          sampleRate,
          channels,
          updatedAt: new Date()
        })
        .where(eq(sessionRecordings.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateRecordingQuality', error);
      throw new Error('Failed to update recording quality');
    }
  }

  /**
   * Обновить доступность записи
   */
  async updateRecordingAvailability(
    id: string,
    isAvailable: boolean,
    availableUntil?: Date
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(sessionRecordings)
        .set({
          isAvailable,
          availableUntil,
          updatedAt: new Date()
        })
        .where(eq(sessionRecordings.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateRecordingAvailability', error);
      throw new Error('Failed to update recording availability');
    }
  }

  /**
   * Удалить запись
   */
  async deleteRecording(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(sessionRecordings)
        .set({
          status: 'deleted',
          isAvailable: false,
          updatedAt: new Date()
        })
        .where(eq(sessionRecordings.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('deleteRecording', error);
      throw new Error('Failed to delete recording');
    }
  }

  /**
   * Удалить запись окончательно
   */
  async permanentlyDeleteRecording(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(sessionRecordings)
        .where(eq(sessionRecordings.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('permanentlyDeleteRecording', error);
      throw new Error('Failed to permanently delete recording');
    }
  }

  /**
   * Получить статистику записей клуба
   */
  async getClubRecordingsStats(clubId: string): Promise<{
    total: number;
    ready: number;
    processing: number;
    failed: number;
    totalDuration: number;
    totalSize: number;
  }> {
    try {
      const recordings = await this.getClubRecordings(clubId);

      const stats = {
        total: recordings.length,
        ready: recordings.filter(r => r.status === 'ready').length,
        processing: recordings.filter(r => r.status === 'processing').length,
        failed: recordings.filter(r => r.status === 'failed').length,
        totalDuration: recordings.reduce((sum, r) => sum + (r.duration || 0), 0),
        totalSize: recordings.reduce((sum, r) => sum + (r.fileSize || 0), 0),
      };

      return stats;
    } catch (error) {
      this.logError('getClubRecordingsStats', error);
      throw new Error('Failed to get club recordings stats');
    }
  }

  /**
   * Получить записи с истёкшим сроком доступности
   */
  async getExpiredRecordings(): Promise<SessionRecording[]> {
    try {
      // Простая реализация — получаем все записи и фильтруем
      // В продакшене лучше сделать SQL запрос с фильтром по дате
      const allRecordings = await this.db
        .select()
        .from(sessionRecordings)
        .where(eq(sessionRecordings.isAvailable, true));

      return allRecordings.filter(r =>
        r.availableUntil && new Date(r.availableUntil) < new Date()
      );
    } catch (error) {
      this.logError('getExpiredRecordings', error);
      throw new Error('Failed to get expired recordings');
    }
  }
}
