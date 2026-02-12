import { fileStorage } from '../file-storage.js';
import { repositories } from '../repositories/index.js';
import { logger } from '../lib/logger.js';

/**
 * RecordingService — сервис управления записями сессий чтения
 *
 * Отвечает за:
 * - Запись и хранение аудио из сессий чтения
 * - Хранение записей в MinIO
 * - Генерацию URL для доступа к записям
 * - Управление жизненным циклом записей
 */

export interface RecordingMetadata {
  sessionId: string;
  clubId: string;
  title?: string;
  format?: 'webm' | 'mp3' | 'wav';
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
}

export interface RecordingOptions {
  autoStart?: boolean;
  maxDuration?: number; // в секундах
  isBackup?: boolean;
  availableUntil?: Date;
}

class RecordingService {
  private readonly activeRecordings: Map<string, ActiveRecording> = new Map();

  /**
   * Создать новую запись сессии
   */
  async createRecording(
    metadata: RecordingMetadata,
    options: RecordingOptions = {}
  ): Promise<{ recordingId: string; sessionId: string }> {
    try {
      // Создаём запись в БД
      const createdRecording = await repositories.sessionRecordings.createRecording({
        sessionId: metadata.sessionId,
        clubId: metadata.clubId,
        format: metadata.format || 'webm',
        isLocal: false,
        isBackup: options.isBackup || false,
        bitrate: metadata.bitrate,
        sampleRate: metadata.sampleRate,
        channels: metadata.channels,
        isAvailable: true,
        availableUntil: options.availableUntil,
        metadata: JSON.stringify({
          title: metadata.title,
          createdAt: new Date().toISOString(),
        }),
      });

      logger.info(`Recording created: ${createdRecording.id} for session ${metadata.sessionId}`);

      return { recordingId: createdRecording.id, sessionId: metadata.sessionId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error creating recording');
      throw new Error('Failed to create recording');
    }
  }

  /**
   * Загрузить аудиофайл записи в хранилище
   */
  async uploadRecordingFile(
    recordingId: string,
    audioBuffer: Buffer,
    format: string
  ): Promise<void> {
    try {
      const recording = await repositories.sessionRecordings.getRecording(recordingId);
      if (!recording) {
        throw new Error(`Recording ${recordingId} not found`);
      }

      // Генерируем ключ для хранения в MinIO
      const storageKey = `recordings/${recording.clubId}/${recording.sessionId}/${recordingId}.${format}`;

      // Загружаем файл в MinIO
      await fileStorage.uploadFile(
        audioBuffer,
        `${recordingId}.${format}`,
        `audio/${format}`,
        'recordings'
      );

      // Получаем публичный URL
      const recordingUrl = fileStorage.getPublicUrl(storageKey);

      // Вычисляем длительность (приблизительно, на основе размера и битрейта)
      const duration = this.estimateDuration(audioBuffer.length, recording.bitrate ?? undefined);

      // Обновляем запись в БД
      await repositories.sessionRecordings.updateRecordingUrl(
        recordingId,
        recordingUrl,
        storageKey,
        duration,
        audioBuffer.length
      );

      logger.info(`Recording uploaded: ${recordingId} -> ${storageKey}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error uploading recording');

      // Отмечаем запись как неудачную
      await repositories.sessionRecordings.updateRecordingStatus(recordingId, 'failed');

      throw new Error('Failed to upload recording');
    }
  }

  /**
   * Получить запись по ID
   */
  async getRecording(recordingId: string) {
    try {
      const recording = await repositories.sessionRecordings.getRecording(recordingId);

      if (!recording) {
        return null;
      }

      // Проверяем доступность
      if (!recording.isAvailable) {
        return { ...recording, available: false, reason: 'Recording is not available' };
      }

      // Проверяем срок действия
      if (recording.availableUntil && new Date(recording.availableUntil) < new Date()) {
        await repositories.sessionRecordings.updateRecordingAvailability(recordingId, false);
        return { ...recording, available: false, reason: 'Recording has expired' };
      }

      return { ...recording, available: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting recording');
      throw new Error('Failed to get recording');
    }
  }

  /**
   * Получить URL для скачивания записи
   */
  async getRecordingDownloadUrl(recordingId: string, expiresIn: number = 3600): Promise<string | null> {
    try {
      const recording = await this.getRecording(recordingId);

      if (!recording || !recording.available || !recording.storageKey) {
        return null;
      }

      // Генерируем подписанный URL
      return await fileStorage.getSignedDownloadUrl(recording.storageKey, expiresIn);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting recording download URL');
      return null;
    }
  }

  /**
   * Получить публичный URL записи
   */
  async getRecordingPublicUrl(recordingId: string): Promise<string | null> {
    try {
      const recording = await this.getRecording(recordingId);

      if (!recording || !recording.available || !recording.recordingUrl) {
        return null;
      }

      return recording.recordingUrl;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting recording public URL');
      return null;
    }
  }

  /**
   * Получить записи сессии
   */
  async getSessionRecordings(sessionId: string) {
    try {
      const recordings = await repositories.sessionRecordings.getSessionRecordings(sessionId);

      // Фильтруем недоступные записи
      return recordings
        .map(r => ({
          ...r,
          available: r.isAvailable && (!r.availableUntil || new Date(r.availableUntil) > new Date()),
        }))
        .filter(r => r.available);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting session recordings');
      throw new Error('Failed to get session recordings');
    }
  }

  /**
   * Получить записи клуба
   */
  async getClubRecordings(clubId: string, availableOnly: boolean = true) {
    try {
      const recordings = availableOnly
        ? await repositories.sessionRecordings.getAvailableClubRecordings(clubId)
        : await repositories.sessionRecordings.getClubRecordings(clubId);

      // Фильтруем по сроку доступности
      return recordings
        .map(r => ({
          ...r,
          available: r.isAvailable && (!r.availableUntil || new Date(r.availableUntil) > new Date()),
        }))
        .filter(r => availableOnly ? r.available : true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting club recordings');
      throw new Error('Failed to get club recordings');
    }
  }

  /**
   * Удалить запись
   */
  async deleteRecording(recordingId: string): Promise<boolean> {
    try {
      const recording = await repositories.sessionRecordings.getRecording(recordingId);
      if (!recording) {
        return false;
      }

      // Удаляем файл из хранилища
      if (recording.storageKey) {
        await fileStorage.deleteFile(recording.storageKey);
        logger.info(`Recording file deleted: ${recording.storageKey}`);
      }

      // Помечаем запись как удалённую
      await repositories.sessionRecordings.deleteRecording(recordingId);

      logger.info(`Recording deleted: ${recordingId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error deleting recording');
      return false;
    }
  }

  /**
   * Очистить записи с истёкшим сроком доступности
   */
  async cleanupExpiredRecordings(): Promise<number> {
    try {
      const expiredRecordings = await repositories.sessionRecordings.getExpiredRecordings();
      let deletedCount = 0;

      for (const recording of expiredRecordings) {
        await this.deleteRecording(recording.id);
        deletedCount++;
      }

      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} expired recordings`);
      }

      return deletedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error cleaning up expired recordings');
      return 0;
    }
  }

  /**
   * Приблизительно вычислить длительность аудио
   */
  private estimateDuration(fileSize: number, bitrate?: number): number {
    if (!bitrate) {
      // Если битрейт неизвестен, используем среднее значение 128 kbps
      bitrate = 128;
    }

    // Длительность в секундах = (размер в битах) / (битрейт в битах)
    const fileSizeInBits = fileSize * 8;
    const bitrateInBits = bitrate * 1000;

    return Math.floor(fileSizeInBits / bitrateInBits);
  }

  /**
   * Получить статистику записей клуба
   */
  async getClubRecordingsStats(clubId: string) {
    try {
      return await repositories.sessionRecordings.getClubRecordingsStats(clubId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting club recordings stats');
      throw new Error('Failed to get club recordings stats');
    }
  }
}

interface ActiveRecording {
  recordingId: string;
  sessionId: string;
  startedAt: Date;
}

// Экспортируем singleton
export const recordingService = new RecordingService();
