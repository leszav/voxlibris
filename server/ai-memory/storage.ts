import { randomUUID } from 'crypto';
import { MemoryChunk, MemorySearchResult, MemoryConfig } from './types';
import fs from 'fs/promises';
import path from 'path';

export class AIMemoryStorage {
  private memoryDir: string;
  private config: MemoryConfig;

  constructor(config: MemoryConfig) {
    this.config = config;
    this.memoryDir = path.join(process.cwd(), 'data', 'ai-memory');
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
      console.log('[AI Memory] Storage initialized:', this.memoryDir);
    } catch (error) {
      console.error('[AI Memory] Failed to initialize storage:', error);
      throw error;
    }
  }

  async storeMemory(chunk: MemoryChunk): Promise<void> {
    try {
      // Создаем путь к файлу на основе userId и даты
      const date = chunk.timestamp.toISOString().split('T')[0];
      const userDir = path.join(this.memoryDir, chunk.userId, date);
      await fs.mkdir(userDir, { recursive: true });

      // Сохраняем chunk в JSON файл
      const filePath = path.join(userDir, `${chunk.id}.json`);
      const content = JSON.stringify(chunk, null, 2);
      await fs.writeFile(filePath, content, 'utf8');

      // Создаем индекс для быстрого поиска
      await this.updateSearchIndex(chunk);

      console.log('[AI Memory] Stored chunk:', chunk.id, 'Type:', chunk.type);
    } catch (error) {
      console.error('[AI Memory] Failed to store memory:', error);
      throw error;
    }
  }

  async searchRelevantMemories(
    query: string, 
    userId: string,
    limit: number = 5
  ): Promise<MemorySearchResult[]> {
    try {
      const userMemoryDir = path.join(this.memoryDir, userId);
      const searchResults: MemorySearchResult[] = [];

      // Простой поиск по содержимому (для начальной реализации)
      const memoryFiles = await this.getAllMemoryFiles(userMemoryDir);
      
      for (const filePath of memoryFiles) {
        const content = await fs.readFile(filePath, 'utf8');
        const chunk: MemoryChunk = JSON.parse(content);
        
        const relevanceScore = this.calculateRelevance(query, chunk);
        
        if (relevanceScore > 0.1) { // Минимальный порог релевантности
          searchResults.push({
            chunk,
            relevanceScore,
            context: this.extractContext(chunk.content)
          });
        }
      }

      // Сортируем по релевантности и приоритету
      return searchResults
        .sort((a, b) => {
          const scoreA = a.relevanceScore * a.chunk.metadata.priority;
          const scoreB = b.relevanceScore * b.chunk.metadata.priority;
          return scoreB - scoreA;
        })
        .slice(0, limit);

    } catch (error) {
      console.error('[AI Memory] Search failed:', error);
      return [];
    }
  }

  async getMemoryBySessionId(sessionId: string, userId: string): Promise<MemoryChunk[]> {
    try {
      const userMemoryDir = path.join(this.memoryDir, userId);
      const memoryFiles = await this.getAllMemoryFiles(userMemoryDir);
      const sessionMemories: MemoryChunk[] = [];

      for (const filePath of memoryFiles) {
        const content = await fs.readFile(filePath, 'utf8');
        const chunk: MemoryChunk = JSON.parse(content);
        
        if (chunk.sessionId === sessionId) {
          sessionMemories.push(chunk);
        }
      }

      return sessionMemories.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } catch (error) {
      console.error('[AI Memory] Failed to get session memories:', error);
      return [];
    }
  }

  async cleanupOldMemories(userId: string): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      const userMemoryDir = path.join(this.memoryDir, userId);
      const memoryFiles = await this.getAllMemoryFiles(userMemoryDir);

      let cleanedCount = 0;
      for (const filePath of memoryFiles) {
        const content = await fs.readFile(filePath, 'utf8');
        const chunk: MemoryChunk = JSON.parse(content);
        
        if (new Date(chunk.timestamp) < cutoffDate && chunk.metadata.priority < this.config.priorityThreshold) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      }

      console.log(`[AI Memory] Cleaned up ${cleanedCount} old memories for user ${userId}`);
    } catch (error) {
      console.error('[AI Memory] Cleanup failed:', error);
    }
  }

  private async getAllMemoryFiles(dir: string): Promise<string[]> {
    try {
      const files: string[] = [];
      
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.getAllMemoryFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          files.push(fullPath);
        }
      }
      
      return files;
    } catch (error) {
      return [];
    }
  }

  private calculateRelevance(query: string, chunk: MemoryChunk): number {
    // Простой алгоритм подсчета релевантности
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentWords = chunk.content.toLowerCase().split(/\s+/);
    
    let matches = 0;
    for (const queryWord of queryWords) {
      if (contentWords.some(word => word.includes(queryWord))) {
        matches++;
      }
    }
    
    const baseScore = matches / queryWords.length;
    
    // Учитываем теги
    const tagMatches = chunk.metadata.tags.filter(tag => 
      queryWords.some(word => tag.toLowerCase().includes(word))
    ).length;
    
    const tagBonus = tagMatches * 0.2;
    
    // Учитываем тип контента
    const typeBonus = this.getTypeRelevanceBonus(chunk.type);
    
    return Math.min(1.0, baseScore + tagBonus + typeBonus);
  }

  private getTypeRelevanceBonus(type: MemoryChunk['type']): number {
    const bonuses = {
      'solution': 0.3,
      'error': 0.25,
      'code': 0.2,
      'decision': 0.15,
      'conversation': 0.1,
      'context': 0.05
    };
    
    return bonuses[type] || 0;
  }

  private extractContext(content: string): string {
    // Извлекаем первые 200 символов как контекст
    if (content.length <= 200) {
      return content;
    }
    
    return content.substring(0, 200) + '...';
  }

  private async updateSearchIndex(chunk: MemoryChunk): Promise<void> {
    // Простая реализация индекса - можно расширить до полнотекстового поиска
    try {
      const indexDir = path.join(this.memoryDir, 'indices');
      await fs.mkdir(indexDir, { recursive: true });
      
      const indexFile = path.join(indexDir, `${chunk.userId}.idx`);
      const indexEntry = {
        id: chunk.id,
        timestamp: chunk.timestamp,
        type: chunk.type,
        tags: chunk.metadata.tags,
        priority: chunk.metadata.priority
      };
      
      let existingIndex = [];
      try {
        const indexContent = await fs.readFile(indexFile, 'utf8');
        existingIndex = JSON.parse(indexContent);
      } catch (error) {
        // Файл индекса не существует, создаем новый
      }
      
      existingIndex.push(indexEntry);
      await fs.writeFile(indexFile, JSON.stringify(existingIndex, null, 2));
    } catch (error) {
      console.error('[AI Memory] Failed to update search index:', error);
    }
  }

  async healthCheck(): Promise<void> {
    try {
      // Проверяем доступность директории хранения
      await fs.access(this.memoryDir);
      
      // Проверяем возможность записи
      const testFile = path.join(this.memoryDir, '.health-check');
      await fs.writeFile(testFile, Date.now().toString());
      await fs.unlink(testFile);
      
      // Все проверки пройдены
    } catch (error) {
      throw new Error(`AI Memory Storage health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getTotalMemoryCount(): Promise<number> {
    try {
      let totalCount = 0;
      const users = await fs.readdir(this.memoryDir);
      
      for (const userId of users) {
        if (userId === 'indices') continue;
        
        const userDir = path.join(this.memoryDir, userId);
        const stat = await fs.stat(userDir);
        if (!stat.isDirectory()) continue;
        
        const dates = await fs.readdir(userDir);
        for (const date of dates) {
          const dateDir = path.join(userDir, date);
          const dateStat = await fs.stat(dateDir);
          if (!dateStat.isDirectory()) continue;
          
          const files = await fs.readdir(dateDir);
          totalCount += files.filter(file => file.endsWith('.json')).length;
        }
      }
      
      return totalCount;
    } catch (error) {
      console.error('[AI Memory] Failed to count memories:', error);
      return 0;
    }
  }
}