import { Router, Request, Response } from 'express';
import { AIMemoryManager } from './manager.js';
import { MemoryChunk } from './types.js';
import { jwtAuth } from '../jwt-middleware.js';

const router = Router();
let memoryManager: AIMemoryManager;

// Инициализация Memory Manager
export function initializeMemoryRoutes(manager: AIMemoryManager) {
  memoryManager = manager;
  return router;
}

// Сохранить воспоминание
router.post('/store', jwtAuth, async (req: Request, res: Response) => {
  try {
    const { content, type, sessionId, fileReferences } = req.body;
    const userId = req.user!.id;

    if (!content || !type || !sessionId) {
      return res.status(400).json({
        error: 'Missing required fields: content, type, sessionId'
      });
    }

    const memoryId = await memoryManager.addToMemory(
      content,
      type,
      sessionId,
      userId,
      fileReferences
    );

    res.json({
      success: true,
      memoryId,
      message: 'Memory stored successfully'
    });

  } catch (error) {
    console.error('[AI Memory API] Store error:', error);
    res.status(500).json({
      error: 'Failed to store memory',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Поиск релевантных воспоминаний
router.post('/search', jwtAuth, async (req: Request, res: Response) => {
  try {
    const { query, sessionId, limit = 10 } = req.body;
    const userId = req.user!.id;

    if (!query) {
      return res.status(400).json({
        error: 'Query parameter is required'
      });
    }

    const context = await memoryManager.getRelevantContext(
      query,
      userId,
      sessionId
    );

    res.json({
      success: true,
      context,
      hasResults: context.length > 0
    });

  } catch (error) {
    console.error('[AI Memory API] Search error:', error);
    res.status(500).json({
      error: 'Failed to search memories',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Получить сводку сессии
router.get('/session/:sessionId/summary', jwtAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const summary = await memoryManager.createSessionSummary(sessionId, userId);

    res.json({
      success: true,
      summary,
      sessionId
    });

  } catch (error) {
    console.error('[AI Memory API] Session summary error:', error);
    res.status(500).json({
      error: 'Failed to create session summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Поиск по тегу
router.get('/search/tag/:tag', jwtAuth, async (req: Request, res: Response) => {
  try {
    const { tag } = req.params;
    const { limit = 20 } = req.query;
    const userId = req.user!.id;

    const results = await memoryManager.searchByTag(
      tag,
      userId,
      Number.parseInt(limit as string, 10)
    );

    res.json({
      success: true,
      results: results.map(result => ({
        id: result.chunk.id,
        content: result.chunk.content,
        timestamp: result.chunk.timestamp,
        type: result.chunk.type,
        relevanceScore: result.relevanceScore,
        tags: result.chunk.metadata.tags
      })),
      count: results.length
    });

  } catch (error) {
    console.error('[AI Memory API] Tag search error:', error);
    res.status(500).json({
      error: 'Failed to search by tag',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Поиск по типу
router.get('/search/type/:type', jwtAuth, async (req: Request, res: Response) => {
  try {
    const { type } = req.params as { type: MemoryChunk['type'] };
    const { limit = 20 } = req.query;
    const userId = req.user!.id;

    const results = await memoryManager.searchByType(
      type,
      userId,
      Number.parseInt(limit as string, 10)
    );

    res.json({
      success: true,
      results: results.map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        timestamp: chunk.timestamp,
        sessionId: chunk.sessionId,
        tags: chunk.metadata.tags,
        priority: chunk.metadata.priority
      })),
      count: results.length
    });

  } catch (error) {
    console.error('[AI Memory API] Type search error:', error);
    res.status(500).json({
      error: 'Failed to search by type',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Получить статистику памяти пользователя
router.get('/stats', jwtAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Простая статистика - можно расширить
    const typeResults = await Promise.all([
      memoryManager.searchByType('conversation', userId, 1000),
      memoryManager.searchByType('code', userId, 1000),
      memoryManager.searchByType('decision', userId, 1000),
      memoryManager.searchByType('error', userId, 1000),
      memoryManager.searchByType('solution', userId, 1000)
    ]);

    const stats = {
      totalMemories: typeResults.reduce((sum, results) => sum + results.length, 0),
      byType: {
        conversation: typeResults[0].length,
        code: typeResults[1].length,
        decision: typeResults[2].length,
        error: typeResults[3].length,
        solution: typeResults[4].length
      },
      oldestMemory: null as Date | null,
      newestMemory: null as Date | null
    };

    // Находим самые старые и новые воспоминания
    const allMemories = typeResults.flat();
    if (allMemories.length > 0) {
      const timestamps = allMemories.map(m => new Date(m.timestamp));
      stats.oldestMemory = new Date(Math.min(...timestamps.map(d => d.getTime())));
      stats.newestMemory = new Date(Math.max(...timestamps.map(d => d.getTime())));
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('[AI Memory API] Stats error:', error);
    res.status(500).json({
      error: 'Failed to get memory stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check endpoint - публичный
router.get('/health', async (req: Request, res: Response) => {
  try {
    if (!memoryManager) {
      return res.status(503).json({
        status: 'unhealthy',
        message: 'AI Memory Manager not initialized',
        timestamp: new Date().toISOString()
      });
    }

    const health = memoryManager.getHealthStatus();
    const detailedStatus = await memoryManager.getDetailedStatus();

    res.json({
      status: health.isHealthy ? 'healthy' : 'unhealthy',
      ...detailedStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[AI Memory API] Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Status endpoint - детальная информация о системе
router.get('/status', async (req: Request, res: Response) => {
  try {
    if (!memoryManager) {
      return res.status(503).json({
        error: 'AI Memory Manager not initialized'
      });
    }

    const detailedStatus = await memoryManager.getDetailedStatus();
    const health = memoryManager.getHealthStatus();

    res.json({
      success: true,
      system: {
        status: health.isHealthy ? 'operational' : 'degraded',
        uptime: detailedStatus.uptime,
        lastHealthCheck: health.lastCheck,
        memoryCount: detailedStatus.memoryCount
      },
      config: detailedStatus.config,
      storage: {
        status: detailedStatus.storageStatus,
        path: process.cwd() + '/data/ai-memory'
      },
      features: {
        autoSave: true,
        healthMonitoring: true,
        memoryCleanup: true,
        contextInjection: true
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[AI Memory API] Status error:', error);
    res.status(500).json({
      error: 'Failed to get system status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Middleware для автоматического сохранения контекста разговора
export const autoSaveMiddleware = (req: Request, res: Response, next: Function) => {
  if (!memoryManager || !req.user?.id) {
    return next();
  }

  // Перехватываем ответ для сохранения контекста
  const originalSend = res.send;
  res.send = function(body) {
    // Асинхронно сохраняем контекст после отправки ответа
    setImmediate(async () => {
      try {
        const sessionId = req.headers['x-session-id'] as string || 'default';
        
        // Сохраняем запрос пользователя
        if (req.body && typeof req.body === 'object') {
          await memoryManager.addToMemory(
            JSON.stringify(req.body, null, 2),
            'conversation',
            sessionId,
            req.user!.id
          );
        }

        // Сохраняем ответ (если это не слишком большой)
        if (body && typeof body === 'string' && body.length < 10000) {
          await memoryManager.addToMemory(
            body,
            'conversation',
            sessionId,
            req.user!.id
          );
        }
      } catch (error) {
        console.error('[AI Memory] Auto-save failed:', error);
      }
    });

    return originalSend.call(this, body);
  };

  next();
};

export default router;