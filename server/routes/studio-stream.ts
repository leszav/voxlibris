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
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { PassThrough } from 'node:stream';
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
import { recordingService } from '../services/recording-service.js';
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

    const finalizeRecording = async (): Promise<void> => {
      if (recordingFinalized) {
        return;
      }

      recordingFinalized = true;

      try {
        const intent = await getStudioStreamClosureIntent(sessionId);
        if (intent !== 'end') {
          logger.info({ sessionId, intent: intent ?? 'unknown' }, 'Skipping studio recording finalization for non-end shutdown');
          return;
        }

        const stats = await fs.promises.stat(recordingPath);
        if (stats.size <= 0) {
          logger.info({ sessionId, recordingPath }, 'Skipping empty studio recording finalization');
          return;
        }

        const session = validation.session;
        if (!session?.clubId) {
          logger.warn({ sessionId }, 'Skipping studio recording finalization: missing clubId');
          return;
        }

        const { recordingId } = await recordingService.createRecording({
          sessionId,
          clubId: session.clubId,
          title: `Studio session ${sessionId}`,
          format: 'mp3',
          bitrate: 64,
          sampleRate: 48000,
          channels: 1,
        });

        const audioBuffer = await fs.promises.readFile(recordingPath);
        await recordingService.uploadRecordingFile(recordingId, audioBuffer, 'mp3');

        logger.info({ sessionId, recordingId, recordingPath }, 'Studio recording finalized successfully');
      } catch (err) {
        logger.error({ err, sessionId, recordingPath }, 'Failed to finalize studio recording');
      } finally {
        await clearStudioStreamClosureIntent(sessionId);
      }
    };

    const cleanup = (reason: string) => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;
      shutdownReason = reason;
      logger.info({ sessionId, reason }, 'Closing stream');
      clearActiveStudioStream(sessionId);
      try { ffmpeg.stdin.destroy(); } catch { /* ignore */ }
      try { ffmpeg.kill('SIGTERM'); } catch { /* ignore */ }
      try { icecastPublishStream.destroy(); } catch { /* ignore */ }
      try { icecastPublisher.stdin.destroy(); } catch { /* ignore */ }
      try { icecastPublisher.kill('SIGTERM'); } catch { /* ignore */ }
      // recordingStream.end() вместо destroy() — дренирует буфер PassThrough в файл.
      // destroy() выбрасывает буфер немедленно → 0 байт если данные не успели пройти.
      // pipe({ end: true }) (default) автоматически вызовет recordingWriteStream.end().
      recordingWriteStream.once('finish', () => {
        void finalizeRecording();
      });
      try { recordingStream.end(); } catch { /* ignore */ }
      if (!res.writableEnded) res.end();
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
      cleanup('icecast-publisher-error');
      if (!res.headersSent) {
        res.status(502).json({ error: 'Cannot connect to streaming server' });
      }
    });

    let liveAccepted = false;

    icecastPublisher.on('spawn', () => {
      liveAccepted = true;
      logger.info({ sessionId, mountPath, recordingPath, recordingFileName }, 'Icecast publish process started');
      setActiveStudioStream(sessionId, { mountPath, recordingPath });

      if (!res.headersSent) {
        // Закрываем response сразу после подтверждения старта.
        // При HTTP/2 upload и response — независимые потоки: request body (upload)
        // продолжается независимо от того, закрыт ли response.
        // Держать response открытым нельзя: Chrome при duplex fetch + HTTP/2
        // ожидает потребления response body; неконсюмированный открытый response
        // приводит к RST_STREAM и обрыву upload примерно через 300s.
        res.status(200).json({ streaming: true, mountPath });
      }
    });

    icecastPublisher.on('close', (code) => {
      if (code !== 0 && code !== null && !isShuttingDown) {
        logger.warn({ sessionId, code }, 'ffmpeg icecast publisher exited with non-zero code');
      }

      if (!liveAccepted && !res.headersSent) {
        res.status(502).json({ error: 'Streaming server rejected the connection' });
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

  const status = await buildStudioStreamStatus(sessionId);
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
