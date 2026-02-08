import { createWorker, types } from 'mediasoup';
import { mediasoupWorkerSettings, mediasoupRouterOptions } from './mediasoup-config.js';
import { logger } from '../lib/logger.js';

/**
 * Менеджер mediasoup - управляет worker и router
 */
export class MediasoupManager {
  private static instance: MediasoupManager;
  private worker: types.Worker | null = null;
  private readonly routers: Map<string, types.Router> = new Map();

  private constructor() {}

  static getInstance(): MediasoupManager {
    if (!MediasoupManager.instance) {
      MediasoupManager.instance = new MediasoupManager();
    }
    return MediasoupManager.instance;
  }

  /**
   * Инициализация worker
   */
  async initialize(): Promise<void> {
    if (this.worker) {
      logger.warn('Mediasoup worker already initialized');
      return;
    }

    try {
      this.worker = await createWorker(mediasoupWorkerSettings);
      
      this.worker.on('died', () => {
        logger.error('Mediasoup worker died! Exiting...');
        process.exit(1);
      });

      logger.info('Mediasoup worker initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize mediasoup worker: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Создать router для комнаты
   */
  async createRouter(roomId: string): Promise<types.Router> {
    if (!this.worker) {
      throw new Error('Mediasoup worker not initialized');
    }

    // Проверяем, существует ли router для этой комнаты
    const existingRouter = this.routers.get(roomId);
    if (existingRouter) {
      return existingRouter;
    }

    try {
      const router = await this.worker.createRouter(mediasoupRouterOptions);
      this.routers.set(roomId, router);

      logger.info(`Router created for room ${roomId}`);
      return router;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create router for room ${roomId}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Получить router по ID комнаты
   */
  getRouter(roomId: string): types.Router | undefined {
    return this.routers.get(roomId);
  }

  /**
   * Удалить router для комнаты
   */
  async closeRouter(roomId: string): Promise<void> {
    const router = this.routers.get(roomId);
    if (!router) {
      logger.warn(`Router for room ${roomId} not found`);
      return;
    }

    try {
      router.close();
      this.routers.delete(roomId);
      logger.info(`Router closed for room ${roomId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to close router for room ${roomId}: ${errorMessage}`);
    }
  }

  /**
   * Создать WebRTC transport для отправки медиа
   */
  async createWebRtcTransport(
    router: types.Router,
    options: {
      enableUdp?: boolean;
      enableTcp?: boolean;
      preferUdp?: boolean;
    } = {}
  ): Promise<types.WebRtcTransport> {
    const transport = await router.createWebRtcTransport({
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
        },
      ],
      enableUdp: options.enableUdp ?? true,
      enableTcp: options.enableTcp ?? true,
      preferUdp: options.preferUdp ?? true,
      enableSctp: true,
      numSctpStreams: {
        OS: 1024,
        MIS: 1024,
      },
      maxSctpMessageSize: 262144,
    });

    logger.info(`WebRtcTransport created: ${transport.id}`);
    return transport;
  }

  /**
   * Создать Plain transport для записи
   */
  async createPlainTransport(router: types.Router): Promise<types.PlainTransport> {
    const transport = await router.createPlainTransport({
      listenIp: {
        ip: '127.0.0.1',
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
      },
      rtcpMux: true,
      comedia: true,
    });

    logger.info(`PlainTransport created: ${transport.id}`);
    return transport;
  }

  /**
   * Очистить все ресурсы
   */
  async close(): Promise<void> {
    logger.info('Closing mediasoup manager...');

    // Закрываем все routers
    for (const [roomId, router] of this.routers.entries()) {
      try {
        router.close();
        logger.info(`Router closed for room ${roomId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to close router for room ${roomId}: ${errorMessage}`);
      }
    }
    this.routers.clear();

    // Закрываем worker
    if (this.worker) {
      try {
        this.worker.close();
        logger.info('Mediasoup worker closed');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to close mediasoup worker: ${errorMessage}`);
      }
      this.worker = null;
    }

    logger.info('Mediasoup manager closed');
  }

  /**
   * Получить статус
   */
  getStatus(): {
    initialized: boolean;
    routersCount: number;
  } {
    return {
      initialized: this.worker !== null,
      routersCount: this.routers.size,
    };
  }
}
