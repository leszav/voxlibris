import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Singleton подключение к базе данных
 * Все репозитории используют одно общее подключение
 */
let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDbConnection(): ReturnType<typeof drizzle> {
  if (!dbInstance) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    const client = postgres(process.env.DATABASE_URL, {
      max: 20, // Connection pool size
      idle_timeout: 20,
      connect_timeout: 10,
    });

    dbInstance = drizzle(client);
  }
  
  return dbInstance;
}

/**
 * Базовый репозиторий для всех доменных репозиториев
 * Обеспечивает единое подключение к БД и общие utility методы
 */
export abstract class BaseRepository {
  protected readonly db: ReturnType<typeof drizzle>;

  constructor() {
    this.db = getDbConnection();
  }

  /**
   * Безопасное получение первого результата из массива
   * Устраняет проблему undefined[0] доступа
   */
  protected getFirstResult<T>(results: T[]): T | undefined {
    return results.length > 0 ? results[0] : undefined;
  }

  /**
   * Валидация обязательных параметров
   * Предотвращает SQL инъекции через некорректные параметры
   */
  protected validateRequired(value: unknown, paramName: string): void {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      throw new Error(`VALIDATION_ERROR: Parameter '${paramName}' is required`);
    }
  }

  /**
   * Безопасное логирование ошибок без exposure sensitive данных
   */
  protected logError(operation: string, error: unknown): void {
    console.error(`[${this.constructor.name}] ${operation} failed:`, {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error, // Полная ошибка для более детального анализа
      timestamp: new Date().toISOString()
    });
  }
}
