import { getRedisClient } from './redis.js';

export type StudioStreamClosureIntent = 'pause' | 'end';

const STUDIO_STREAM_INTENT_TTL_SECONDS = Number.parseInt(process.env.STUDIO_STREAM_INTENT_TTL_SECONDS || '1800', 10);

function intentKey(sessionId: string): string {
  return `vl:studio:intent:${sessionId}`;
}

export async function setStudioStreamClosureIntent(
  sessionId: string,
  intent: StudioStreamClosureIntent,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  await redis.set(intentKey(sessionId), intent, { EX: STUDIO_STREAM_INTENT_TTL_SECONDS });
}

export async function getStudioStreamClosureIntent(sessionId: string): Promise<StudioStreamClosureIntent | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  const intent = await redis.get(intentKey(sessionId));
  return intent === 'pause' || intent === 'end' ? intent : null;
}

export async function clearStudioStreamClosureIntent(sessionId: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  await redis.del(intentKey(sessionId));
}
