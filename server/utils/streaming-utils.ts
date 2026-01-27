import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * Утилиты для потоковой обработки файлов с минимизацией использования памяти
 */
export class StreamingUtils {
  /**
   * Создает Readable поток из Buffer с контролем памяти
   */
  static createBufferStream(buffer: Buffer, chunkSize: number = 64 * 1024): Readable {
    let offset = 0;
    
    return new Readable({
      read() {
        const chunk = buffer.slice(offset, offset + chunkSize);
        offset += chunkSize;
        
        if (chunk.length === 0) {
          this.push(null); // End of stream
        } else {
          this.push(chunk);
        }
      }
    });
  }

  /**
   * Обрабатывает большие файлы порциями
   */
  static async processInChunks<T, R>(
    data: T[],
    processor: (chunk: T[]) => Promise<R[]>,
    chunkSize: number = 100
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      const chunkResults = await processor(chunk);
      results.push(...chunkResults);
      
      // Небольшая задержка для предотвращения блокировки event loop
      if (i + chunkSize < data.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    return results;
  }

  /**
   * Ограничивает количество одновременных операций
   */
  static async throttlePromises<T>(
    operations: (() => Promise<T>)[],
    concurrency: number = 5
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];
    
    for (const operation of operations) {
      const promise = operation().then(result => {
        results.push(result);
        executing.splice(executing.indexOf(promise), 1);
      });
      
      executing.push(promise);
      
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }
    
    await Promise.all(executing);
    return results;
  }

  /**
   * Валидация размера файла с учетом доступной памяти
   */
  static validateFileSize(fileSize: number, maxMemoryUsage: number = 100 * 1024 * 1024): {
    isValid: boolean;
    shouldUseStreaming: boolean;
    error?: string;
  } {
    if (fileSize > maxMemoryUsage * 2) {
      return {
        isValid: false,
        shouldUseStreaming: true,
        error: `File too large: ${Math.round(fileSize / 1024 / 1024)}MB. Maximum supported size is ${Math.round(maxMemoryUsage / 1024 / 1024)}MB`
      };
    }
    
    if (fileSize > maxMemoryUsage * 0.5) {
      return {
        isValid: true,
        shouldUseStreaming: true
      };
    }
    
    return {
      isValid: true,
      shouldUseStreaming: false
    };
  }

  /**
   * Мониторинг памяти во время обработки
   */
  static trackMemoryUsage(operation: string): () => { used: number; peak: number } {
    const startTime = Date.now();
    let peakMemory = 0;
    
    const memoryMonitor = setInterval(() => {
      const memUsage = process.memoryUsage();
      const used = memUsage.heapUsed / 1024 / 1024;
      if (used > peakMemory) {
        peakMemory = used;
      }
      
      // Предупреждение о высоком использовании памяти
      if (used > 500) {
        console.warn(`High memory usage during ${operation}: ${used.toFixed(2)}MB`);
      }
    }, 100);
    
    return () => {
      clearInterval(memoryMonitor);
      const duration = Date.now() - startTime;
      return {
        used: process.memoryUsage().heapUsed / 1024 / 1024,
        peak: peakMemory,
        duration
      } as any;
    };
  }
}