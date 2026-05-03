import { createClient } from 'redis';
import { logger } from './logger.js';

type AppRedisClient = ReturnType<typeof createClient>;

function withRedisPasswordIfMissing(redisUrl: string, password: string): string {
  if (!password) return redisUrl;

  try {
    const parsed = new URL(redisUrl);
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') return redisUrl;
    if (parsed.password || parsed.username) return redisUrl;
    parsed.password = password;
    return parsed.toString();
  } catch {
    return redisUrl;
  }
}

function buildRedisUrl(): string | null {
  const isProduction = process.env.NODE_ENV === 'production';
  const redisPassword = process.env.REDIS_PASSWORD || (isProduction ? '' : 'redis_dev');
  const configuredRedisUrl = process.env.REDIS_URL || '';

  if (configuredRedisUrl) {
    return withRedisPasswordIfMissing(configuredRedisUrl, redisPassword);
  }

  if (!isProduction) {
    return `redis://:${encodeURIComponent(redisPassword)}@127.0.0.1:6379`;
  }

  return null;
}

let redisClient: AppRedisClient | null = null;
let redisConnectPromise: Promise<AppRedisClient | null> | null = null;

export async function getRedisClient(): Promise<AppRedisClient | null> {
  if (redisClient?.isOpen) return redisClient;
  if (redisConnectPromise !== null) return redisConnectPromise;

  redisConnectPromise = (async () => {
    const redisUrl = buildRedisUrl();
    if (!redisUrl) {
      logger.warn('[redis] REDIS_URL is not configured, Redis features disabled');
      return null;
    }

    const client = createClient({ url: redisUrl });
    client.on('error', (error) => {
      logger.warn({ error }, '[redis] Redis client error');
    });

    try {
      await client.connect();
      redisClient = client;
      logger.info('[redis] Redis client connected');
      return client;
    } catch (error) {
      logger.warn({ error }, '[redis] Redis connect failed');
      try { await client.disconnect(); } catch { /* ignore */ }
      return null;
    } finally {
      redisConnectPromise = null;
    }
  })();

  return redisConnectPromise;
}
