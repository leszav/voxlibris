import Redis from 'ioredis';

// Создаем клиент Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err: any) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

export { redis };

/**
 * Декоратор для кэширования результатов функций в Redis
 */
function cached(ttl: number = 300, keyPrefix: string = '') {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      // Создаем ключ кэша
      const argsKey = args.length > 0 ? JSON.stringify(args) : 'no-args';
      const cacheKey = `cache:${keyPrefix || target.constructor.name}:${propertyKey}:${argsKey}`;
      
      try {
        // Пытаемся получить из кэша
        const cached = await redis.get(cacheKey);
        if (cached) {
          console.log(`Cache HIT: ${cacheKey}`);
          return JSON.parse(cached);
        }
        
        // Выполняем оригинальный метод
        console.log(`Cache MISS: ${cacheKey}`);
        const result = await originalMethod.apply(this, args);
        
        // Сохраняем в кэш
        await redis.setex(cacheKey, ttl, JSON.stringify(result));
        
        return result;
      } catch (error) {
        // Если Redis недоступен, выполняем метод без кэша
        console.error(`Cache error for ${cacheKey}:`, error);
        return originalMethod.apply(this, args);
      }
    };
    
    return descriptor;
  };
}

/**
 * Инвалидация кэша по паттерну
 */
async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Invalidated ${keys.length} cache entries for pattern: ${pattern}`);
    }
  } catch (error) {
    console.error(`Cache invalidation error for pattern ${pattern}:`, error);
  }
}

/**
 * Инвалидация кэша для конкретного метода
 */
async function invalidateMethodCache(className: string, methodName: string): Promise<void> {
  const pattern = `cache:${className}:${methodName}:*`;
  await invalidateCache(pattern);
}

export { cached, invalidateCache, invalidateMethodCache };