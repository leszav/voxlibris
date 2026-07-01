/**
 * Icecast Stream Proxy
 *
 * Принимает непрерывный аудиопоток от чтеца и пробрасывает его в Icecast.
 * Клиент (браузер) НЕ знает source_password — авторизация через JWT VoxLibris.
 *
 * Важно: этот роут должен монтироваться ДО rate-limiting для обычных запросов,
 * т.к. стрим — это один долгоживущий запрос, а не серия коротких.
 *
 * Транскодинг:
 *   Браузер (MediaRecorder) отдаёт audio/webm;codecs=opus.
 *   WebM — не streamable-контейнер: слушатели, подключившиеся после старта,
 *   не получают EBML/Segment-заголовок и не могут декодировать поток.
 *   Решение: ffmpeg перепаковывает Opus-пакеты из WebM в Ogg без перекодирования
 *   (copy-режим). Ogg — streamable: каждый Ogg-page самодостаточен для декодера.
 *
 *   req → ffmpeg(pipe:0 → pipe:1, Opus→MP3 libmp3lame) → icecastReq
 *
 *   Выходной формат — MP3 (audio/mpeg): поддерживается нативно во всех браузерах
 *   (Chrome, Firefox, Safari, Edge). Icecast отдаёт слушателям обычный MP3-поток.
 */

import { Router, type Request, type Response } from 'express';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { jwtAuth } from '../jwt-middleware.js';
import { logger } from '../lib/logger.js';
import {
  clearStudioStreamClosureIntent,
  getStudioStreamClosureIntent,
} from '../lib/studio-stream-intent-store.js';
import {
  createStudioRecordingFilePath,
  getStudioRecordingsDir,
} from '../lib/studio-recording-storage.js';
import { buildStudioStreamStatus, resolveStudioStreamSessionForReader } from '../lib/studio-streaming-service.js';
import { isReaderLedClub } from '../lib/reader-club-access.js';
import { recordingService } from '../services/recording-service.js';
import { storage } from '../repositories/index.js';
import { clubs, sessionRecordings } from '../../shared/schema.js';
import {
  clearActiveStudioStream,
  getStudioMountPath,
  hasActiveStudioStream,
  setActiveStudioStream,
} from '../lib/studio-streaming-state.js';

const router = Router();

const ICECAST_INTERNAL_HOST = process.env.ICECAST_INTERNAL_HOST || 'srv-captain--vl-icecast';
const ICECAST_INTERNAL_PORT = Number.parseInt(process.env.ICECAST_INTERNAL_PORT || '8000', 10);
const ICECAST_SOURCE_PASSWORD = process.env.ICECAST_SOURCE_PASSWORD;
const STUDIO_RECORDINGS_DIR = getStudioRecordingsDir();
const ICECAST_MOUNT_PROBE_ATTEMPTS = 12;
const ICECAST_MOUNT_PROBE_DELAY_MS = 250;
const FORCE_PUBLISHER_SHUTDOWN_TIMEOUT_MS = 3000;

const ALLOWED_AUDIO_CONTENT_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
]);

function isAllowedAudioContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  // Нормализуем: убираем пробелы, lowercase
  const normalized = contentType.toLowerCase().replaceAll(/\s/g, '');
  for (const allowed of ALLOWED_AUDIO_CONTENT_TYPES) {
    if (normalized.startsWith(allowed)) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function probeIcecastMount(mountPath: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const request = http.request({
      hostname: ICECAST_INTERNAL_HOST,
      port: ICECAST_INTERNAL_PORT,
      path: mountPath,
      method: 'GET',
      headers: {
        'User-Agent': 'VoxLibris-Mount-Probe/1.0',
      },
    }, (response) => {
      const ok = response.statusCode === 200;
      response.destroy();
      resolve(ok);
    });

    request.setTimeout(1500, () => {
      request.destroy(new Error('Icecast mount probe timed out'));
    });

    request.on('error', () => {
      resolve(false);
    });

    request.end();
  });
}

async function waitForIcecastMount(mountPath: string): Promise<boolean> {
  for (let attempt = 0; attempt < ICECAST_MOUNT_PROBE_ATTEMPTS; attempt += 1) {
    if (await probeIcecastMount(mountPath)) {
      return true;
    }

    if (attempt < ICECAST_MOUNT_PROBE_ATTEMPTS - 1) {
      await sleep(ICECAST_MOUNT_PROBE_DELAY_MS);
    }
  }

  return false;
}

/**
 * POST /api/studio/stream/:sessionId
 *
 * Чтец начинает эфир. Тело запроса — непрерывный аудиопоток (WebM/Opus).
 * Запрос живёт всё время эфира; при закрытии — mountpoint на Icecast пропадает.
 */
router.post(
  '/:sessionId',
  jwtAuth,
  async (req: Request, res: Response): Promise<void> => {
    // Studio ingest — это долгоживущий upload-запрос на всё время эфира.
    // Не даём стандартным HTTP timeout'ам оборвать его посреди трансляции.
    req.setTimeout(0);
    res.setTimeout(0);
    req.socket.setTimeout(0);

    if (!ICECAST_SOURCE_PASSWORD) {
      logger.error('ICECAST_SOURCE_PASSWORD env var is not set');
      res.status(503).json({ error: 'Streaming service not configured' });
      return;
    }

    const { sessionId } = req.params;
    const userId = req.user?.id ?? req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Проверяем Content-Type до всего остального
    const contentType = req.headers['content-type'];
    if (!isAllowedAudioContentType(contentType)) {
      res.status(415).json({ error: 'Unsupported Media Type. Expected audio/webm or audio/ogg' });
      return;
    }

    // Проверяем сессию и права
    const validation = await resolveStudioStreamSessionForReader(sessionId, userId);
    if (!validation.ok) {
      if (validation.status === 500) {
        logger.error({ sessionId }, 'Failed to validate reading session for studio stream');
      }
      res.status(validation.status).json({ error: validation.error });
      return;
    }

    await clearStudioStreamClosureIntent(sessionId);
    const club = validation.session?.clubId
      ? await db.select().from(clubs).where(eq(clubs.id, validation.session.clubId)).limit(1).then(([row]) => row ?? null)
      : null;
    const publicationRequested = req.query.record !== 'false' && Boolean(club && isReaderLedClub(club));

    // Mount point формата /live/<sessionId>
    const mountPath = getStudioMountPath(sessionId);

    // Идемпотентность: если поток уже активен, не открываем второй PUT в Icecast.
    if (hasActiveStudioStream(sessionId)) {
      logger.info({ sessionId, mountPath }, 'Stream already active, skipping duplicate start');
      req.resume();
      if (!res.headersSent) {
        res.status(200).json({ streaming: true, mountPath, alreadyStreaming: true });
      }
      return;
    }

    // Серверная запись эфира: весь session lifecycle пишется в один mp3-файл.
    // При pause/resume следующий ingest продолжит запись append-режимом.
    const { filePath: recordingPath, fileName: recordingFileName } = createStudioRecordingFilePath(sessionId);
    fs.mkdirSync(STUDIO_RECORDINGS_DIR, { recursive: true });
    const recordingWriteStream = fs.createWriteStream(recordingPath, { flags: 'a' });

    logger.info({ sessionId, userId, mountPath }, 'Starting Icecast proxy stream (WebM→Ogg via ffmpeg)');

    // ── ffmpeg: Opus (из WebM) → MP3 ──────────────────────────────────────
    // MP3 (audio/mpeg) — единственный формат с нативной поддержкой во ВСЕХ браузерах,
    // включая Safari. Icecast принимает и раздаёт его без каких-либо плагинов
    // на стороне слушателя.
    // Для речевого потока (аудиокнига) 64 kbps MP3 даёт отличное качество.
    // -fflags +nobuffer / -probesize 32 — минимизируем задержку старта.
    const ffmpeg = spawn('ffmpeg', [
      '-v', 'error',
      '-fflags', '+nobuffer',
      '-analyzeduration', '0',
      '-probesize', '32',
      '-i', 'pipe:0',
      '-c:a', 'libmp3lame',
      '-b:a', '64k',
      '-ar', '48000',
      '-f', 'mp3',
      'pipe:1',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const icecastPublishStream = new PassThrough();
    const recordingStream = new PassThrough();
    const icecastUrl = new URL(`icecast://source:${ICECAST_SOURCE_PASSWORD}@${ICECAST_INTERNAL_HOST}:${ICECAST_INTERNAL_PORT}${mountPath}`);
    icecastUrl.searchParams.set('ice_name', `VoxLibris Session ${sessionId}`);
    icecastUrl.searchParams.set('ice_public', '0');
    icecastUrl.searchParams.set('ice_description', `Session ${sessionId}`);

    const icecastPublisher = spawn('ffmpeg', [
      '-v', 'error',
      '-f', 'mp3',
      '-i', 'pipe:0',
      '-c:a', 'copy',
      '-content_type', 'audio/mpeg',
      '-f', 'mp3',
      icecastUrl.toString(),
    ], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    let isShuttingDown = false;
    let shutdownReason: string | null = null;
    let recordingFinalized = false;
    let mountConfirmed = false;
    let forceShutdownTimer: NodeJS.Timeout | null = null;

    const clearForceShutdownTimer = () => {
      if (!forceShutdownTimer) {
        return;
      }

      clearTimeout(forceShutdownTimer);
      forceShutdownTimer = null;
    };

    const scheduleForceShutdown = () => {
      clearForceShutdownTimer();
      forceShutdownTimer = setTimeout(() => {
        try { ffmpeg.kill('SIGKILL'); } catch { /* ignore */ }
        try { icecastPublisher.kill('SIGKILL'); } catch { /* ignore */ }
      }, FORCE_PUBLISHER_SHUTDOWN_TIMEOUT_MS);
      forceShutdownTimer.unref?.();
    };

    const finalizeRecording = async (): Promise<void> => {
      if (recordingFinalized) {
        return;
      }

      recordingFinalized = true;

      try {
        const intent = await getStudioStreamClosureIntent(sessionId);
        const session = await storage.getReadingSession(sessionId).catch(() => validation.session);
        const sessionAlreadyEnded = Boolean(session && (!session.isActive || session.endedAt));

        if (intent !== 'end' && !sessionAlreadyEnded) {
          logger.info({ sessionId, intent: intent ?? 'unknown' }, 'Skipping studio recording finalization for non-end shutdown');
          return;
        }

        const stats = await fs.promises.stat(recordingPath);
        if (stats.size <= 0) {
          logger.info({ sessionId, recordingPath }, 'Skipping empty studio recording finalization');
          return;
        }

        if (!session?.clubId) {
          logger.warn({ sessionId }, 'Skipping studio recording finalization: missing clubId');
          return;
        }

        if (publicationRequested) {
          const { recordingId } = await recordingService.createRecording({
            sessionId,
            clubId: session.clubId,
            title: `Studio session ${sessionId}`,
            format: 'mp3',
            bitrate: 64,
            sampleRate: 48000,
            channels: 1,
          }, { publicationRequested: true });

          const audioBuffer = await fs.promises.readFile(recordingPath);
          await recordingService.uploadRecordingFile(recordingId, audioBuffer, 'mp3');

          logger.info({ sessionId, recordingId, recordingPath }, 'Studio recording finalized successfully');
          return;
        }

        const [arbitrationRecording] = await db
          .insert(sessionRecordings)
          .values({
            sessionId,
            clubId: session.clubId,
            recordingUrl: `/api/v1/admin/recordings/${encodeURIComponent(recordingFileName.replace(/\.mp3$/i, ''))}/stream`,
            storageKey: `local:${recordingFileName}`,
            duration: null,
            fileSize: stats.size,
            format: 'mp3',
            status: 'ready',
            isLocal: true,
            isBackup: false,
            bitrate: 64,
            sampleRate: 48000,
            channels: 1,
            isAvailable: false,
            publicationRequested: false,
            moderationStatus: 'pending',
            isPublished: false,
            allowStreaming: false,
            allowDownload: false,
            metadata: JSON.stringify({
              title: `Studio arbitration session ${sessionId}`,
              arbitrationOnly: true,
              createdAt: new Date().toISOString(),
            }),
          })
          .returning();

        logger.info({ sessionId, recordingId: arbitrationRecording?.id, recordingPath }, 'Studio arbitration recording saved without publication workflow');
      } catch (err) {
        logger.error({ err, sessionId, recordingPath }, 'Failed to finalize studio recording');
      } finally {
        clearForceShutdownTimer();
        await clearStudioStreamClosureIntent(sessionId);
      }
    };

    const finalizeAfterRecordingFlush = () => {
      let finalizeStarted = false;

      const runOnce = () => {
        if (finalizeStarted) {
          return;
        }

        finalizeStarted = true;
        void finalizeRecording();
      };

      if (recordingWriteStream.writableFinished || recordingWriteStream.closed) {
        runOnce();
        return;
      }

      recordingWriteStream.once('finish', runOnce);
      recordingWriteStream.once('close', runOnce);
    };

    const cleanup = (reason: string) => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;
      shutdownReason = reason;
      logger.info({ sessionId, reason }, 'Closing stream');
      clearActiveStudioStream(sessionId);

      finalizeAfterRecordingFlush();

      try { req.unpipe(ffmpeg.stdin); } catch { /* ignore */ }
      try { ffmpeg.stdin.end(); } catch {
        try { ffmpeg.stdin.destroy(); } catch { /* ignore */ }
      }

      scheduleForceShutdown();

      if (res.headersSent && !res.writableEnded) {
        res.end();
      }
    };

    recordingWriteStream.on('error', (err) => {
      logger.error({ err, sessionId, recordingPath }, 'Recording file write error');
    });

    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      // ffmpeg пишет в stderr только при -v error
      if (isShuttingDown) {
        return;
      }
      logger.warn({ sessionId, ffmpegStderr: chunk.toString().trim() }, 'ffmpeg error output');
    });

    icecastPublisher.stderr.on('data', (chunk: Buffer) => {
      if (isShuttingDown) {
        return;
      }
      logger.warn({ sessionId, ffmpegIcecastStderr: chunk.toString().trim() }, 'ffmpeg icecast publish error output');
    });

    ffmpeg.on('error', (err) => {
      logger.error({ err, sessionId }, 'ffmpeg process error — is ffmpeg installed?');
      if (res.headersSent) {
        cleanup('ffmpeg-error');
      } else {
        res.status(500).json({ error: 'Transcoding error: ffmpeg not available' });
      }
    });

    icecastPublisher.on('error', (err) => {
      logger.error({ err, sessionId }, 'ffmpeg icecast publisher error');
      if (!res.headersSent) {
        res.status(502).json({ error: 'Cannot connect to streaming server' });
      }
      cleanup('icecast-publisher-error');
    });

    const confirmMountAndRespond = async (): Promise<void> => {
      const mountReady = await waitForIcecastMount(mountPath);
      if (isShuttingDown || mountConfirmed) {
        return;
      }

      if (!mountReady) {
        logger.error({ sessionId, mountPath }, 'Icecast publisher started but mount did not become available');
        if (!res.headersSent) {
          res.status(502).json({ error: 'Streaming server did not expose live stream' });
        }
        cleanup('icecast-mount-timeout');
        return;
      }

      mountConfirmed = true;
      logger.info({ sessionId, mountPath, recordingPath, recordingFileName }, 'Icecast live mount confirmed');
      setActiveStudioStream(sessionId, { mountPath, recordingPath });
    };

    icecastPublisher.on('spawn', () => {
      logger.info({ sessionId, mountPath, recordingPath, recordingFileName }, 'Icecast publish process started');
      void confirmMountAndRespond();
    });

    icecastPublisher.on('close', (code) => {
      if (code !== 0 && code !== null && !isShuttingDown) {
        logger.warn({ sessionId, code }, 'ffmpeg icecast publisher exited with non-zero code');
      }

      if (!mountConfirmed && !res.headersSent) {
        res.status(502).json({ error: 'Streaming server rejected the connection' });
      }

      if (!isShuttingDown) {
        cleanup('icecast-publisher-close');
      }
    });

    // ── Пайпинг: req → ffmpeg → tee → icecast/file ───────────────────────
    req.pipe(ffmpeg.stdin);
    ffmpeg.stdout.pipe(icecastPublishStream);
    ffmpeg.stdout.pipe(recordingStream);
    icecastPublishStream.pipe(icecastPublisher.stdin);
    recordingStream.pipe(recordingWriteStream);

    // ffmpeg завершился (нормально или по ошибке)
    ffmpeg.on('close', (code) => {
      if (code !== 0 && code !== null && !isShuttingDown) {
        logger.warn({ sessionId, code }, 'ffmpeg exited with non-zero code');
      }
      cleanup('ffmpeg-close');
    });

    req.on('close', () => {
      // stdin ffmpeg-а закроется сам через pipe, ffmpeg завершится и даст 'close'
      logger.info({ sessionId }, 'Reader disconnected');
    });

    req.on('error', (err) => {
      const errorCode = err instanceof Error && 'code' in err ? String(err.code) : undefined;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isExpectedAbort = isShuttingDown || errorCode === 'ECONNRESET' || errorMessage === 'aborted';
      if (isExpectedAbort) {
        logger.info({ sessionId, reason: shutdownReason ?? 'req-error', code: errorCode }, 'Reader stream closed during shutdown');
      } else {
        logger.error({ err, sessionId }, 'Reader stream error');
      }
      cleanup('req-error');
    });
  },
);

/**
 * GET /api/studio/stream/:sessionId/status
 *
 * Возвращает URL потока для слушателя.
 * Публичный эндпоинт (в рамках клуба доступ к сессии уже проверяется выше).
 */
router.get('/:sessionId/status', jwtAuth, async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const userId = req.user?.id || req.user?.userId;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const status = await buildStudioStreamStatus(sessionId, { userId, role: req.user?.role });
  if (!status.ok) {
    if (status.status === 500) {
      logger.error({ sessionId }, 'Failed to fetch session for studio stream status');
    }
    res.status(status.status).json({ error: status.error });
    return;
  }

  res.json(status.payload);
});

export default router;
