/**
 * Icecast Live Stream Proxy Middleware
 * 
 * Проксирует GET /live/:sessionId.mp3 запросы к Icecast mount point
 * для слушателей, которые хотят получить поток в браузере.
 * 
 * Без этого proxy:
 * - nginx направляет /live/* на voxlibris-dev
 * - voxlibris-dev не знает как обработать /live/* и возвращает 404
 * 
 * С этим proxy:
 * - /live/:sessionId.mp3 → проксируется на http://icecast:8000/live/:sessionId.mp3
 * - Браузер получает поток напрямую от Icecast через Node.js proxy
 */

import { request as httpRequest } from 'node:http';
import type { Request, Response } from 'express';
import { logger } from './logger.js';

const ICECAST_INTERNAL_HOST = process.env.ICECAST_INTERNAL_HOST || 'srv-captain--vl-icecast';
const ICECAST_INTERNAL_PORT = Number.parseInt(process.env.ICECAST_INTERNAL_PORT || '8000', 10);

/**
 * Middleware для проксирования /live/* запросов на Icecast
 */
export function createIcecastLiveProxy() {
  return async (req: Request, res: Response): Promise<void> => {
    // Только GET запросы для live потоков
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).json({ error: 'Method not allowed. Use GET or HEAD.' });
      return;
    }

    // Конструируем путь к Icecast mount point
    // /live/sessionId.mp3 → /live/sessionId.mp3
    const path = req.originalUrl || req.url || '/live/unknown.mp3';
    
    // Проверяем что это validPath (базовая защита от path traversal)
    if (path.includes('..') || !path.startsWith('/live/')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    logger.debug(`[icecast-proxy] Proxying ${req.method} ${path} to ${ICECAST_INTERNAL_HOST}:${ICECAST_INTERNAL_PORT}`);

    try {
      // Создаем запрос к Icecast
      const icecastReq = httpRequest(
        {
          hostname: ICECAST_INTERNAL_HOST,
          port: ICECAST_INTERNAL_PORT,
          path,
          method: req.method,
          timeout: 30000, // 30 second timeout
          // Передаем заголовки клиента (User-Agent, Range, etc.)
          headers: {
            'User-Agent': req.headers['user-agent'] || 'VoxLibris-Client',
            'Range': req.headers['range'],
            'Connection': 'close',
          },
        },
        (icecastRes) => {
          // Копируем статус и заголовки от Icecast
          res.statusCode = icecastRes.statusCode || 200;
          
          // Копируем важные заголовки
          const headersToProxy = [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'icy-metaint', // Icecast metadata interval
            'icy-name',
            'icy-description',
            'icy-genre',
            'icy-url',
          ];

          for (const header of headersToProxy) {
            const value = icecastRes.headers[header];
            if (value) {
              res.setHeader(header, value);
            }
          }

          // Важно: НЕ устанавливаем Keep-Alive для потоков
          res.setHeader('Connection', 'close');

          // Проксируем body потока
          icecastRes.pipe(res);

          // Обработка ошибок stream
          icecastRes.on('error', (err) => {
            logger.error({ error: err }, `[icecast-proxy] Icecast response error for ${path}`);
            if (!res.headersSent) {
              res.status(502).json({ error: 'Bad gateway - Icecast error' });
            } else {
              res.destroy();
            }
          });
        },
      );

      // Установка timeout на request
      icecastReq.on('timeout', () => {
        logger.warn(`[icecast-proxy] Timeout connecting to Icecast for ${path}`);
        icecastReq.destroy();
        if (!res.headersSent) {
          res.status(504).json({ error: 'Gateway timeout' });
        }
      });

      // Обработка ошибок соединения с Icecast
      icecastReq.on('error', (err) => {
        logger.error({ error: err }, `[icecast-proxy] Failed to connect to Icecast (${ICECAST_INTERNAL_HOST}:${ICECAST_INTERNAL_PORT}) for ${path}`);
        if (!res.headersSent) {
          res.status(503).json({ error: 'Service unavailable - Icecast not responding' });
        }
      });

      // Отправляем request
      icecastReq.end();

    } catch (err) {
      logger.error({ error: err }, `[icecast-proxy] Unexpected error proxying ${path}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
}
