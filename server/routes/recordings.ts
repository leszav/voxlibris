import { Router, Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storage, repositories } from '../repositories/index.js';
import { recordingService } from '../services/recording-service.js';
import { logger } from '../lib/logger.js';
import { getStudioRecordingsDir } from '../lib/studio-recording-storage.js';

const router = Router();
const MAX_RECORDING_UPLOAD_BYTES = (Number.parseInt(process.env.MAX_RECORDING_UPLOAD_MB || '25', 10) || 25) * 1024 * 1024;
const MAX_SIGNED_URL_EXPIRES_SECONDS = Number.parseInt(process.env.MAX_RECORDING_SIGNED_URL_SECONDS || '3600', 10) || 3600;
const MIN_SIGNED_URL_EXPIRES_SECONDS = 60;
const allowedAudioFormats = new Set(['webm', 'mp3', 'wav', 'ogg', 'm4a', 'aac']);

function getUserId(req: Request): string | null {
  return req.user?.id || req.user?.userId || null;
}

function isSystemElevated(req: Request): boolean {
  return req.user?.role === 'admin' || req.user?.role === 'moderator';
}

function clampSignedUrlTtl(rawValue: unknown): number {
  if (typeof rawValue !== 'string') {
    return MAX_SIGNED_URL_EXPIRES_SECONDS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return MAX_SIGNED_URL_EXPIRES_SECONDS;
  }

  return Math.max(MIN_SIGNED_URL_EXPIRES_SECONDS, Math.min(parsed, MAX_SIGNED_URL_EXPIRES_SECONDS));
}

async function hasClubAccess(req: Request, clubId: string): Promise<boolean> {
  const userId = getUserId(req);
  if (!userId) {
    return false;
  }

  if (isSystemElevated(req)) {
    return true;
  }

  const membership = await storage.getUserClubMembership(clubId, userId);
  return Boolean(membership && membership.isActive);
}

async function canAccessSessionData(req: Request, clubId: string, readerId?: string | null): Promise<boolean> {
  const userId = getUserId(req);
  if (!userId) {
    return false;
  }

  if (await hasClubAccess(req, clubId)) {
    return true;
  }

  return Boolean(readerId && readerId === userId);
}

function isRecordingPubliclyPlayable(recording: Awaited<ReturnType<typeof recordingService.getRecording>>): boolean {
  return Boolean(
    recording
    && recording.available
    && recording.status === 'ready'
    && recording.moderationStatus === 'approved'
    && recording.isPublished
    && recording.allowStreaming
  );
}

function isRecordingPubliclyDownloadable(recording: Awaited<ReturnType<typeof recordingService.getRecording>>): boolean {
  return Boolean(
    recording
    && recording.available
    && recording.status === 'ready'
    && recording.moderationStatus === 'approved'
    && recording.isPublished
    && recording.allowDownload
  );
}

function normalizeBase64AudioPayload(payload: unknown): string | null {
  if (typeof payload !== 'string') {
    return null;
  }

  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  const strippedPrefix = trimmed.replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, '');
  return strippedPrefix || null;
}

function getAudioMimeType(filePath: string): string {
  return path.extname(filePath).toLowerCase() === '.mp3' ? 'audio/mpeg' : 'application/octet-stream';
}

function resolveLocalRecordingPath(storageKey: string | null | undefined): string | null {
  if (!storageKey?.startsWith('local:')) {
    return null;
  }

  const fileName = storageKey.slice('local:'.length);
  if (!fileName || fileName.includes('/') || fileName.includes('\\')) {
    return null;
  }

  return path.join(getStudioRecordingsDir(), fileName);
}

async function sendFileRangeResponse(req: Request, res: Response, filePath: string): Promise<void> {
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;
  const range = req.headers.range;
  const contentType = getAudioMimeType(filePath);

  if (!range) {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize.toString());
    res.setHeader('Accept-Ranges', 'bytes');
    res.sendFile(filePath);
    return;
  }

  const [startRaw, endRaw] = range.replace(/bytes=/, '').split('-');
  const start = Number.parseInt(startRaw, 10);
  const end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1;

  if (!Number.isFinite(start) || start < 0 || start >= fileSize || end < start) {
    res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  res.status(206);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(end - start + 1));
  res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);

  const stream = createReadStream(filePath, { start, end });
  stream.pipe(res);
}

/**
 * GET /api/recordings/:id
 * Получить запись по ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { id } = req.params;

    const recording = await recordingService.getRecording(id);

    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    const session = await storage.getReadingSession(recording.sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found for recording',
      });
    }

    const hasAccess = await canAccessSessionData(req, recording.clubId, session.readerId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to access this recording',
      });
    }

    const club = await storage.getClub(recording.clubId);
    const isOwnerOrReader = club?.ownerId === userId || session.readerId === userId;
    if (!isSystemElevated(req) && !isOwnerOrReader && !isRecordingPubliclyPlayable(recording)) {
      return res.status(403).json({
        success: false,
        error: 'Recording is not published or not available for streaming',
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
 * GET /api/recordings/:id/stream-url
 * Получить URL для прослушивания записи без включения права скачивания
 */
router.get('/:id/stream-url', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { id } = req.params;
    const recording = await recordingService.getRecording(id);
    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    const session = await storage.getReadingSession(recording.sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found for recording',
      });
    }

    const hasAccess = await canAccessSessionData(req, recording.clubId, session.readerId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to access this recording',
      });
    }

    const club = await storage.getClub(recording.clubId);
    const isOwnerOrReader = club?.ownerId === userId || session.readerId === userId;
    if (!isSystemElevated(req) && !isOwnerOrReader && !isRecordingPubliclyPlayable(recording)) {
      return res.status(403).json({
        success: false,
        error: 'Recording is not published or not available for streaming',
      });
    }

    const url = await recordingService.getRecordingPublicUrl(id);
    if (!url) {
      return res.status(404).json({
        success: false,
        error: 'Recording stream URL not found',
      });
    }

    res.json({
      success: true,
      url,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting recording stream URL: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get recording stream URL',
    });
  }
});

/**
 * GET /api/recordings/:id/stream
 * Отдать аудиопоток записи после проверки прав на прослушивание
 */
router.get('/:id/stream', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { id } = req.params;
    const recording = await recordingService.getRecording(id);
    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    const session = await storage.getReadingSession(recording.sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found for recording',
      });
    }

    const hasAccess = await canAccessSessionData(req, recording.clubId, session.readerId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to access this recording',
      });
    }

    const club = await storage.getClub(recording.clubId);
    const isOwnerOrReader = club?.ownerId === userId || session.readerId === userId;
    if (!isSystemElevated(req) && !isOwnerOrReader && !isRecordingPubliclyPlayable(recording)) {
      return res.status(403).json({
        success: false,
        error: 'Recording is not published or not available for streaming',
      });
    }

    const localFilePath = resolveLocalRecordingPath(recording.storageKey);
    if (localFilePath) {
      await fs.access(localFilePath);
      res.setHeader('Cache-Control', 'no-store');
      await sendFileRangeResponse(req, res, localFilePath);
      return;
    }

    const url = await recordingService.getRecordingPublicUrl(id);
    if (!url) {
      return res.status(404).json({
        success: false,
        error: 'Recording stream not found',
      });
    }

    res.redirect(url);
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    if (errorCode === 'ENOENT') {
      return res.status(404).json({
        success: false,
        error: 'Recording file not found',
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error streaming recording: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to stream recording',
    });
  }
});

/**
 * GET /api/recordings/:id/download
 * Получить подписанный URL для скачивания записи
 */
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { id } = req.params;
    const expiresIn = clampSignedUrlTtl(req.query.expiresIn);

    const recording = await recordingService.getRecording(id);
    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    const session = await storage.getReadingSession(recording.sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found for recording',
      });
    }

    const hasAccess = await canAccessSessionData(req, recording.clubId, session.readerId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to access this recording',
      });
    }

    const club = await storage.getClub(recording.clubId);
    const isOwnerOrReader = club?.ownerId === userId || session.readerId === userId;
    if (!isSystemElevated(req) && !isOwnerOrReader && !isRecordingPubliclyDownloadable(recording)) {
      return res.status(403).json({
        success: false,
        error: 'Recording is not published or not available for download',
      });
    }

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
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { sessionId } = req.params;

    // Проверяем существование сессии
    const session = await storage.getReadingSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    const hasAccess = await canAccessSessionData(req, session.clubId, session.readerId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to access session recordings',
      });
    }

    const allRecordings = await recordingService.getSessionRecordings(sessionId);
    const club = await storage.getClub(session.clubId);
    const canManageRecordings = isSystemElevated(req) || club?.ownerId === userId || session.readerId === userId;
    const recordings = canManageRecordings
      ? allRecordings
      : allRecordings.filter(isRecordingPubliclyPlayable);

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
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

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

    const hasAccess = await hasClubAccess(req, clubId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to access club recordings',
      });
    }

    const allRecordings = await recordingService.getClubRecordings(clubId, availableOnly);
    const canManageRecordings = isSystemElevated(req) || club.ownerId === userId;
    const recordings = canManageRecordings
      ? allRecordings
      : allRecordings.filter(isRecordingPubliclyPlayable);

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
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { clubId } = req.params;

    // Проверяем существование клуба
    const club = await storage.getClub(clubId);
    if (!club) {
      return res.status(404).json({
        success: false,
        error: 'Club not found',
      });
    }

    const hasAccess = await hasClubAccess(req, clubId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to access club recording stats',
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
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { id } = req.params;
    const { audioData, format } = req.body;

    if (!audioData || !format || typeof format !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'audioData and format are required',
      });
    }

    const normalizedFormat = format.toLowerCase();
    if (!allowedAudioFormats.has(normalizedFormat)) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported audio format',
      });
    }

    const normalizedAudioData = normalizeBase64AudioPayload(audioData);
    if (!normalizedAudioData) {
      return res.status(400).json({
        success: false,
        error: 'audioData must be a base64 string',
      });
    }

    const estimatedPayloadBytes = Math.floor((normalizedAudioData.length * 3) / 4);
    if (estimatedPayloadBytes > MAX_RECORDING_UPLOAD_BYTES) {
      return res.status(413).json({
        success: false,
        error: `Recording payload too large. Max ${Math.round(MAX_RECORDING_UPLOAD_BYTES / 1024 / 1024)} MB`,
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
    const audioBuffer = Buffer.from(normalizedAudioData, 'base64');
    if (audioBuffer.length === 0 || audioBuffer.length > MAX_RECORDING_UPLOAD_BYTES) {
      return res.status(413).json({
        success: false,
        error: `Recording payload too large. Max ${Math.round(MAX_RECORDING_UPLOAD_BYTES / 1024 / 1024)} MB`,
      });
    }

    // Загружаем файл
    await recordingService.uploadRecordingFile(id, audioBuffer, normalizedFormat);

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
 * PUT /api/recordings/:id/moderation
 * Административная модерация записи перед публикацией владельцем клуба.
 */
router.put('/:id/moderation', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!isSystemElevated(req)) {
      return res.status(403).json({ success: false, error: 'Only moderators can moderate recordings' });
    }

    const { id } = req.params;
    const { moderationStatus, moderationNotes } = req.body as { moderationStatus?: unknown; moderationNotes?: unknown };
    if (moderationStatus !== 'pending' && moderationStatus !== 'approved' && moderationStatus !== 'rejected') {
      return res.status(400).json({ success: false, error: 'Invalid moderation status' });
    }

    const existingRecording = await repositories.sessionRecordings.getRecording(id);
    if (!existingRecording) {
      return res.status(404).json({ success: false, error: 'Recording not found' });
    }
    if (!existingRecording.publicationRequested) {
      return res.status(409).json({ success: false, error: 'Arbitration-only recordings cannot be moderated for publication' });
    }

    const recording = await repositories.sessionRecordings.updateModerationStatus(
      id,
      moderationStatus,
      userId,
      typeof moderationNotes === 'string' ? moderationNotes.slice(0, 2000) : null,
    );
    if (!recording) {
      return res.status(404).json({ success: false, error: 'Recording not found' });
    }

    res.json({ success: true, recording });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error moderating recording: ${errorMessage}`);
    res.status(500).json({ success: false, error: 'Failed to moderate recording' });
  }
});

/**
 * PUT /api/recordings/:id/publication
 * Публикация/снятие с публикации владельцем клуба после административной модерации.
 */
router.put('/:id/publication', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const recording = await repositories.sessionRecordings.getRecording(id);
    if (!recording) {
      return res.status(404).json({ success: false, error: 'Recording not found' });
    }
    if (!recording.publicationRequested) {
      return res.status(409).json({ success: false, error: 'Arbitration-only recordings cannot be published' });
    }

    const club = await storage.getClub(recording.clubId);
    if (!club) {
      return res.status(404).json({ success: false, error: 'Club not found' });
    }
    if (club.ownerId !== userId && !isSystemElevated(req)) {
      return res.status(403).json({ success: false, error: 'Only the club owner can publish recordings' });
    }

    const body = req.body as {
      isPublished?: unknown;
      publicTitle?: unknown;
      publicAuthor?: unknown;
      publicDescription?: unknown;
      coverImageUrl?: unknown;
      allowStreaming?: unknown;
      allowDownload?: unknown;
    };
    const isPublished = body.isPublished === true;

    if (isPublished && recording.moderationStatus !== 'approved') {
      return res.status(409).json({ success: false, error: 'Recording must be approved before publication' });
    }
    if (isPublished && recording.status !== 'ready') {
      return res.status(409).json({ success: false, error: 'Recording file is not ready' });
    }

    const updatedRecording = await repositories.sessionRecordings.updatePublication(id, {
      isPublished,
      publishedBy: userId,
      publicTitle: typeof body.publicTitle === 'string' ? body.publicTitle.trim().slice(0, 255) : null,
      publicAuthor: typeof body.publicAuthor === 'string' ? body.publicAuthor.trim().slice(0, 255) : null,
      publicDescription: typeof body.publicDescription === 'string' ? body.publicDescription.trim().slice(0, 5000) : null,
      coverImageUrl: typeof body.coverImageUrl === 'string' ? body.coverImageUrl.trim().slice(0, 2000) : null,
      allowStreaming: body.allowStreaming === true,
      allowDownload: body.allowDownload === true,
    });

    res.json({ success: true, recording: updatedRecording });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error publishing recording: ${errorMessage}`);
    res.status(500).json({ success: false, error: 'Failed to publish recording' });
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
