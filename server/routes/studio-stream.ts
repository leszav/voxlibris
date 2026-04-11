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
import path from 'node:path';
import { jwtAuth } from '../jwt-middleware.js';
import { logger } from '../lib/logger.js';
import { storage } from '../repositories/index.js';

const router = Router();

const ICECAST_INTERNAL_HOST = process.env.ICECAST_INTERNAL_HOST || 'srv-captain--vl-icecast';
const ICECAST_INTERNAL_PORT = Number.parseInt(process.env.ICECAST_INTERNAL_PORT || '8000', 10);
const ICECAST_SOURCE_PASSWORD = process.env.ICECAST_SOURCE_PASSWORD;
const STUDIO_RECORDINGS_DIR = process.env.STUDIO_RECORDINGS_DIR
  || path.resolve(process.cwd(), 'uploads', 'recordings');

// Активные прокси-потоки по sessionId (один эфир на одну сессию)
const activeStreams = new Map<string, { mountPath: string; recordingPath: string }>();

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
    let session: Awaited<ReturnType<typeof storage.getReadingSession>>;
    try {
      session = await storage.getReadingSession(sessionId);
    } catch (err) {
      logger.error({ err, sessionId }, 'Failed to fetch reading session');
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    if (!session) {
      res.status(404).json({ error: 'Reading session not found' });
      return;
    }

    if (session.readerId !== userId) {
      res.status(403).json({ error: 'Only the session reader can stream audio' });
      return;
    }

    if (!session.isActive) {
      res.status(409).json({ error: 'Reading session is not active' });
      return;
    }

    // Mount point формата /live/<sessionId>
    const mountPath = `/live/${sessionId}`;

    // Идемпотентность: если поток уже активен, не открываем второй PUT в Icecast.
    if (activeStreams.has(sessionId)) {
      logger.info({ sessionId, mountPath }, 'Stream already active, skipping duplicate start');
      req.resume();
      if (!res.headersSent) {
        res.status(200).json({ streaming: true, mountPath, alreadyStreaming: true });
      }
      return;
    }

    const credentials = Buffer.from(`source:${ICECAST_SOURCE_PASSWORD}`).toString('base64');

    // Серверная запись эфира: сохраняем mp3 для последующего прослушивания.
    // В имени файла убираем двоеточия и точки, чтобы путь был кроссплатформенным.
    const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const recordingFilename = `${sessionId}-${timestamp}.mp3`;
    const recordingPath = path.join(STUDIO_RECORDINGS_DIR, recordingFilename);
    fs.mkdirSync(STUDIO_RECORDINGS_DIR, { recursive: true });
    const recordingWriteStream = fs.createWriteStream(recordingPath, { flags: 'w' });

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

    const cleanup = (reason: string) => {
      logger.info({ sessionId, reason }, 'Closing stream');
      activeStreams.delete(sessionId);
      try { ffmpeg.stdin.destroy(); } catch { /* ignore */ }
      try { ffmpeg.kill('SIGTERM'); } catch { /* ignore */ }
      try { recordingWriteStream.end(); } catch { /* ignore */ }
      icecastReq.destroy();
      if (!res.writableEnded) res.end();
    };

    recordingWriteStream.on('error', (err) => {
      logger.error({ err, sessionId, recordingPath }, 'Recording file write error');
    });

    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      // ffmpeg пишет в stderr только при -v error
      logger.warn({ sessionId, ffmpegStderr: chunk.toString().trim() }, 'ffmpeg error output');
    });

    ffmpeg.on('error', (err) => {
      logger.error({ err, sessionId }, 'ffmpeg process error — is ffmpeg installed?');
      if (res.headersSent) {
        cleanup('ffmpeg-error');
      } else {
        res.status(500).json({ error: 'Transcoding error: ffmpeg not available' });
      }
    });

    // ── Открываем соединение с Icecast ────────────────────────────────────
    const icecastReq = http.request({
      hostname: ICECAST_INTERNAL_HOST,
      port: ICECAST_INTERNAL_PORT,
      path: mountPath,
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${credentials}`,
        // Icecast получает MP3 — браузеры слушателей воспроизводят нативно
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'ice-name': `VoxLibris Session ${sessionId}`,
        'ice-public': '0',
        'ice-description': `Session ${sessionId}`,
      },
    });

    let responded = false;

    // Icecast ответил на PUT — поток принят
    icecastReq.on('response', (icecastRes) => {
      if (responded) return;
      responded = true;

      if (icecastRes.statusCode !== 200) {
        logger.warn(
          { statusCode: icecastRes.statusCode, sessionId },
          'Icecast rejected stream',
        );
        icecastRes.resume();
        cleanup('icecast-rejected');
        if (!res.headersSent) {
          res.status(502).json({ error: 'Streaming server rejected the connection' });
        }
        return;
      }

      logger.info({ sessionId, mountPath, recordingPath }, 'Icecast accepted MP3 stream');
      activeStreams.set(sessionId, { mountPath, recordingPath });
      icecastRes.resume();

      if (!res.headersSent) {
        res.status(200);
        res.setHeader('Content-Type', 'application/json');
        res.flushHeaders();
      }
    });

    icecastReq.on('error', (err) => {
      logger.error({ err, sessionId }, 'Icecast connection error');
      cleanup('icecast-error');
      if (!res.headersSent) {
        res.status(502).json({ error: 'Cannot connect to streaming server' });
      }
    });

    // ── Пайпинг: req → ffmpeg → icecast ──────────────────────────────────
    req.pipe(ffmpeg.stdin);
    ffmpeg.stdout.pipe(icecastReq);
    ffmpeg.stdout.pipe(recordingWriteStream);

    // ffmpeg завершился (нормально или по ошибке)
    ffmpeg.on('close', (code) => {
      if (code !== 0 && code !== null) {
        logger.warn({ sessionId, code }, 'ffmpeg exited with non-zero code');
      }
      cleanup('ffmpeg-close');
    });

    req.on('close', () => {
      // stdin ffmpeg-а закроется сам через pipe, ffmpeg завершится и даст 'close'
      logger.info({ sessionId }, 'Reader disconnected');
    });

    req.on('error', (err) => {
      logger.error({ err, sessionId }, 'Reader stream error');
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

  let session: Awaited<ReturnType<typeof storage.getReadingSession>>;
  try {
    session = await storage.getReadingSession(sessionId);
  } catch (err) {
    logger.error({ err, sessionId }, 'Failed to fetch session for status');
    res.status(500).json({ error: 'Internal Server Error' });
    return;
  }

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const icecastPublicUrl = process.env.ICECAST_PUBLIC_URL || 'https://radio.voxlibris.ru';

  res.json({
    sessionId,
    isLive: session.isLive && session.isActive,
    streamUrl: session.isLive && session.isActive
      ? `${icecastPublicUrl}/live/${sessionId}`
      : null,
  });
});

export default router;
