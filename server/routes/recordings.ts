import { Router, Request, Response } from 'express';
import { storage, repositories } from '../repositories/index.js';
import { recordingService } from '../services/recording-service.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * GET /api/recordings/:id
 * Получить запись по ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const recording = await recordingService.getRecording(id);

    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    res.json({
      success: true,
      recording,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting recording: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get recording',
    });
  }
});

/**
 * GET /api/recordings/:id/download
 * Получить подписанный URL для скачивания записи
 */
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const expiresIn = req.query.expiresIn ? Number.parseInt(req.query.expiresIn as string, 10) : 3600;

    const url = await recordingService.getRecordingDownloadUrl(id, expiresIn);

    if (!url) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found or not available',
      });
    }

    res.json({
      success: true,
      url,
      expiresIn,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting recording download URL: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get recording download URL',
    });
  }
});

/**
 * GET /api/sessions/:sessionId/recordings
 * Получить записи сессии
 */
router.get('/sessions/:sessionId/recordings', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Проверяем существование сессии
    const session = await storage.getReadingSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    const recordings = await recordingService.getSessionRecordings(sessionId);

    res.json({
      success: true,
      recordings,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting session recordings: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get session recordings',
    });
  }
});

/**
 * GET /api/clubs/:clubId/recordings
 * Получить записи клуба
 */
router.get('/clubs/:clubId/recordings', async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const availableOnly = req.query.availableOnly !== 'false'; // По умолчанию только доступные

    // Проверяем существование клуба
    const club = await storage.getClub(clubId);
    if (!club) {
      return res.status(404).json({
        success: false,
        error: 'Club not found',
      });
    }

    const recordings = await recordingService.getClubRecordings(clubId, availableOnly);

    res.json({
      success: true,
      recordings,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting club recordings: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get club recordings',
    });
  }
});

/**
 * GET /api/clubs/:clubId/recordings/stats
 * Получить статистику записей клуба
 */
router.get('/clubs/:clubId/recordings/stats', async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;

    // Проверяем существование клуба
    const club = await storage.getClub(clubId);
    if (!club) {
      return res.status(404).json({
        success: false,
        error: 'Club not found',
      });
    }

    const stats = await recordingService.getClubRecordingsStats(clubId);

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting club recordings stats: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get club recordings stats',
    });
  }
});

/**
 * POST /api/recordings
 * Создать новую запись сессии
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { sessionId, clubId, title, format, bitrate, sampleRate, channels } = req.body;

    if (!sessionId || !clubId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and clubId are required',
      });
    }

    // Проверяем существование сессии
    const session = await storage.getReadingSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Проверяем, что пользователь — чтец этой сессии
    if (session.readerId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the session reader can create recordings',
      });
    }

    // Создаём запись
    const result = await recordingService.createRecording({
      sessionId,
      clubId,
      title,
      format,
      bitrate,
      sampleRate,
      channels,
    });

    res.status(201).json({
      success: true,
      recordingId: result.recordingId,
      sessionId: result.sessionId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error creating recording: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to create recording',
    });
  }
});

/**
 * POST /api/recordings/:id/upload
 * Загрузить аудиофайл записи
 */
router.post('/:id/upload', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { id } = req.params;
    const { audioData, format } = req.body;

    if (!audioData || !format) {
      return res.status(400).json({
        success: false,
        error: 'audioData and format are required',
      });
    }

    // Проверяем существование записи
    const recording = await repositories.sessionRecordings.getRecording(id);
    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    // Проверяем, что пользователь — чтец сессии
    const session = await storage.getReadingSession(recording.sessionId);
    if (session?.readerId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the session reader can upload recordings',
      });
    }

    // Конвертируем base64 в Buffer
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Загружаем файл
    await recordingService.uploadRecordingFile(id, audioBuffer, format);

    res.json({
      success: true,
      message: 'Recording uploaded successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error uploading recording: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to upload recording',
    });
  }
});

/**
 * DELETE /api/recordings/:id
 * Удалить запись
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { id } = req.params;

    // Проверяем существование записи
    const recording = await repositories.sessionRecordings.getRecording(id);
    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    // Проверяем права: только чтец сессии или владелец клуба может удалять
    const session = await storage.getReadingSession(recording.sessionId);
    const club = await storage.getClub(recording.clubId);

    const isReader = session?.readerId === userId;
    const isClubOwner = club?.ownerId === userId;
    const isAdmin = req.user?.role === 'admin';

    if (!isReader && !isClubOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to delete this recording',
      });
    }

    // Удаляем запись
    const success = await recordingService.deleteRecording(id);

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete recording',
      });
    }

    res.json({
      success: true,
      message: 'Recording deleted successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error deleting recording: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to delete recording',
    });
  }
});

export default router;
