import { randomUUID } from 'node:crypto';
import { MemoryChunk, MemorySearchResult, MemoryConfig, ConversationContext } from './types.js';
import { AIMemoryStorage } from './storage.js';

export class AIMemoryManager {
  private readonly storage: AIMemoryStorage;
  private readonly config: MemoryConfig;
  private readonly activeContexts: Map<string, ConversationContext> = new Map();
  private isHealthy: boolean = false;
  private lastHealthCheck: Date = new Date();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<MemoryConfig>) {
    this.config = {
      maxContextSize: 50000,
      embeddingModel: 'text-embedding-3-small',
      vectorDimensions: 1536,
      retentionDays: 90,
      priorityThreshold: 3,
      ...config
    };
    
    this.storage = new AIMemoryStorage(this.config);
  }

  async initialize(): Promise<void> {
    try {
      await this.storage.initialize();
      
      // Запускаем периодическую очистку старых воспоминаний
      setInterval(async () => {
        await this.cleanupRoutine();
      }, 24 * 60 * 60 * 1000); // Каждые 24 часа

      // Запускаем health check мониторинг
      this.startHealthMonitoring();
      
      this.isHealthy = true;
      this.lastHealthCheck = new Date();
      
      console.log('🧠 [AI Memory Manager] ✅ ONLINE - Initialized with config:', this.config);
      console.log('🔄 [AI Memory Manager] Health monitoring started - checks every 30 seconds');
    } catch (error) {
      this.isHealthy = false;
      console.error('❌ [AI Memory Manager] FAILED to initialize:', error);
      throw error;
    }
  }

  private startHealthMonitoring(): void {
    // Health check каждые 30 секунд
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 30000);
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Проверяем доступность storage
      await this.storage.healthCheck();
      
      if (!this.isHealthy) {
        console.log('🧠 [AI Memory Manager] ✅ RECOVERED - System is healthy again');
      }
      
      this.isHealthy = true;
      this.lastHealthCheck = new Date();
    } catch (error) {
      if (this.isHealthy) {
        console.error('🧠 [AI Memory Manager] ❌ UNHEALTHY - Health check failed:', error);
      }
      this.isHealthy = false;
    }
  }

  public getHealthStatus(): {
    isHealthy: boolean;
    lastCheck: Date;
    uptime: number;
    memoryCount?: number;
  } {
    return {
      isHealthy: this.isHealthy,
      lastCheck: this.lastHealthCheck,
      uptime: Date.now() - this.lastHealthCheck.getTime()
    };
  }

  public async getDetailedStatus(): Promise<{
    isHealthy: boolean;
    lastCheck: Date;
    uptime: number;
    memoryCount: number;
    storageStatus: string;
    config: MemoryConfig;
  }> {
    try {
      const memoryCount = await this.storage.getTotalMemoryCount();
      
      return {
        isHealthy: this.isHealthy,
        lastCheck: this.lastHealthCheck,
        uptime: Date.now() - this.lastHealthCheck.getTime(),
        memoryCount,
        storageStatus: this.isHealthy ? 'operational' : 'degraded',
        config: this.config
      };
    } catch (error) {
      console.error('Ошибка при проверке здоровья AI Memory:', error);
      return {
        isHealthy: false,
        lastCheck: this.lastHealthCheck,
        uptime: Date.now() - this.lastHealthCheck.getTime(),
        memoryCount: 0,
        storageStatus: 'failed',
        config: this.config
      };
    }
  }

  public destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    console.log('🧠 [AI Memory Manager] ⏹️  SHUTDOWN - Health monitoring stopped');
  }

  async addToMemory(
    content: string,
    type: MemoryChunk['type'],
    sessionId: string,
    userId: string,
    fileReferences?: string[]
  ): Promise<string> {
    const chunk: MemoryChunk = {
      id: randomUUID(),
      content: this.sanitizeContent(content),
      timestamp: new Date(),
      sessionId,
      userId,
      type,
      metadata: {
        tags: this.extractTags(content),
        priority: this.calculatePriority(content, type),
        fileReferences: fileReferences || this.extractFileReferences(content)
      }
    };

    await this.storage.storeMemory(chunk);
    this.updateActiveContext(sessionId, userId, chunk);
    
    console.log(`[AI Memory] Added ${type} memory for user ${userId}, session ${sessionId}`);
    return chunk.id;
  }

  async getRelevantContext(
    query: string, 
    userId: string, 
    sessionId?: string
  ): Promise<string> {
    try {
      // Получаем релевантные воспоминания
      const memories = await this.storage.searchRelevantMemories(query, userId, 10);
      
      // Если указана сессия, добавляем контекст текущей сессии
      if (sessionId) {
        const sessionMemories = await this.storage.getMemoryBySessionId(sessionId, userId);
        // Берем последние 5 воспоминаний из текущей сессии
        const recentSessionMemories = sessionMemories
          .slice(-5)
          .map(chunk => ({
            chunk,
            relevanceScore: 1,
            context: chunk.content
          }));
        
        memories.push(...recentSessionMemories);
      }

      return this.formatContextForInjection(memories);
    } catch (error) {
      console.error('[AI Memory] Failed to get relevant context:', error);
      return '';
    }
  }

  async createSessionSummary(sessionId: string, userId: string): Promise<string> {
    const sessionMemories = await this.storage.getMemoryBySessionId(sessionId, userId);
    
    if (sessionMemories.length === 0) {
      return 'Пустая сессия - нет активности.';
    }

    const summary = {
      totalMessages: sessionMemories.filter(m => m.type === 'conversation').length,
      codeChanges: sessionMemories.filter(m => m.type === 'code').length,
      decisions: sessionMemories.filter(m => m.type === 'decision').length,
      errors: sessionMemories.filter(m => m.type === 'error').length,
      solutions: sessionMemories.filter(m => m.type === 'solution').length,
      startTime: sessionMemories[0].timestamp,
      endTime: sessionMemories.at(-1)!.timestamp,
      mainTopics: this.extractMainTopics(sessionMemories)
    };

    return this.formatSessionSummary(summary);
  }

  async searchByTag(tag: string, userId: string, limit: number = 20): Promise<MemorySearchResult[]> {
    return this.storage.searchRelevantMemories(`tag:${tag}`, userId, limit);
  }

  async searchByType(type: MemoryChunk['type'], userId: string, limit: number = 20): Promise<MemoryChunk[]> {
    const allResults = await this.storage.searchRelevantMemories(`type:${type}`, userId, limit * 2);
    return allResults
      .filter(result => result.chunk.type === type)
      .slice(0, limit)
      .map(result => result.chunk);
  }

  private sanitizeContent(content: string): string {
    // Удаляем потенциально чувствительные данные
    return content
      .replaceAll(/passwords?\s*[:=]\s*\S+/gi, 'password: [REDACTED]')
      .replaceAll(/tokens?\s*[:=]\s*\S+/gi, 'token: [REDACTED]')
      .replaceAll(/api[_-]?keys?\s*[:=]\s*\S+/gi, 'api_key: [REDACTED]')
      .trim();
  }

  private extractTags(content: string): string[] {
    const tags = new Set<string>();
    
    // Извлекаем теги на основе ключевых слов
    const patterns = {
      'react': /\b(react|jsx|tsx|component|hook|state|props)\b/gi,
      'typescript': /\b(typescript|interface|type|enum|generic)\b/gi,
      'database': /\b(postgresql|sql|query|migration|schema)\b/gi,
      'api': /\b(api|endpoint|route|request|response)\b/gi,
      'auth': /\b(auth|login|register|token|session)\b/gi,
      'frontend': /\b(frontend|client|ui|ux|css|style)\b/gi,
      'backend': /\b(backend|server|express|node)\b/gi,
      'bug': /\b(bug|error|fix|issue|problem)\b/gi,
      'feature': /\b(feature|implement|add|create|new)\b/gi,
      'optimization': /\b(optimize|performance|improve|refactor)\b/gi
    };

    for (const [tag, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) {
        tags.add(tag);
      }
    }

    // Извлекаем названия файлов как теги
    const fileMatches = content.match(/[\w-]+\.(ts|tsx|js|jsx|sql|md|json)/g);
    if (fileMatches) {
      fileMatches.forEach(file => tags.add(`file:${file}`));
    }

    return Array.from(tags);
  }

  private calculatePriority(content: string, type: MemoryChunk['type']): number {
    let priority = 1;
    
    // Базовый приоритет по типу
    const typePriorities = {
      'solution': 5,
      'error': 4,
      'decision': 4,
      'code': 3,
      'conversation': 2,
      'context': 1
    };
    
    priority += typePriorities[type] || 1;
    
    // Увеличиваем приоритет для критических ситуаций
    if (content.includes('КРИТИЧЕСКИЙ') || content.includes('URGENT')) {
      priority += 3;
    }
    
    if (content.includes('РЕШЕНИЕ:') || content.includes('FIX:')) {
      priority += 2;
    }
    
    if (content.includes('TODO') || content.includes('ЗАДАЧА')) {
      priority += 1;
    }
    
    // Длинный контент может быть более важным
    if (content.length > 1000) {
      priority += 1;
    }
    
    return Math.min(priority, 10); // Максимальный приоритет 10
  }

  private extractFileReferences(content: string): string[] {
    const fileRefs = new Set<string>();
    
    // Паттерны для поиска файлов
    const patterns = [
      /[\w-/]+\.(ts|tsx|js|jsx|json|md|sql|yaml|yml)/g,
      /src\/[\w-/]+/g,
      /server\/[\w-/]+/g,
      /client\/[\w-/]+/g,
      /docs\/[\w-/]+/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        fileRefs.add(match[0]);
      }
    });
    
    return Array.from(fileRefs);
  }

  private updateActiveContext(sessionId: string, userId: string, chunk: MemoryChunk): void {
    const contextKey = `${userId}:${sessionId}`;
    let context = this.activeContexts.get(contextKey);
    
    context ??= {
      sessionId,
      userId,
      activeMemories: [],
      lastActivity: new Date()
    };
    
    context.activeMemories.push(chunk);
    context.lastActivity = new Date();
    
    // Ограничиваем размер активного контекста
    if (context.activeMemories.length > 50) {
      context.activeMemories = context.activeMemories.slice(-30);
    }
    
    this.activeContexts.set(contextKey, context);
  }

  private formatContextForInjection(memories: MemorySearchResult[]): string {
    if (memories.length === 0) {
      return '';
    }

    const sections = memories.map(memory => {
      const { chunk, relevanceScore } = memory;
      const timestamp = new Date(chunk.timestamp).toLocaleString('ru-RU');
      
      return `[${chunk.type.toUpperCase()}] [${timestamp}] [Релевантность: ${(relevanceScore * 100).toFixed(0)}%]
${chunk.content}
Теги: ${chunk.metadata.tags.join(', ')}`;
    });

    return `
=== КОНТЕКСТ ИЗ ПРЕДЫДУЩИХ СЕССИЙ ===
${sections.join('\n\n---\n\n')}
=== КОНЕЦ КОНТЕКСТА ===
    `.trim();
  }

  private extractMainTopics(memories: MemoryChunk[]): string[] {
    const topicCounts = new Map<string, number>();
    
    memories.forEach(memory => {
      memory.metadata.tags.forEach(tag => {
        if (!tag.startsWith('file:')) {
          topicCounts.set(tag, (topicCounts.get(tag) || 0) + 1);
        }
      });
    });
    
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);
  }

  private formatSessionSummary(summary: any): string {
    const duration = new Date(summary.endTime).getTime() - new Date(summary.startTime).getTime();
    const durationMinutes = Math.round(duration / (1000 * 60));
    
    return `
📊 СВОДКА СЕССИИ
⏱️ Длительность: ${durationMinutes} минут
💬 Сообщений: ${summary.totalMessages}
💻 Изменений кода: ${summary.codeChanges}
🎯 Решений: ${summary.decisions}
❌ Ошибок: ${summary.errors}
✅ Решений: ${summary.solutions}
🏷️ Основные темы: ${summary.mainTopics.join(', ')}
    `.trim();
  }

  private async cleanupRoutine(): Promise<void> {
    console.log('[AI Memory] Starting cleanup routine...');
    
    // Очищаем старые активные контексты
    const now = Date.now();
    Array.from(this.activeContexts.entries()).forEach(([key, context]) => {
      const lastActivity = context.lastActivity.getTime();
      if (now - lastActivity > 24 * 60 * 60 * 1000) { // 24 часа
        this.activeContexts.delete(key);
      }
    });
    
    console.log('[AI Memory] Cleanup routine completed');
  }
}