import { getRedisClient } from './redis.js';

export type StudioStreamClosureIntent = 'pause' | 'end';

const STUDIO_STREAM_INTENT_TTL_SECONDS = Number.parseInt(process.env.STUDIO_STREAM_INTENT_TTL_SECONDS || '1800', 10);
const localIntents = new Map<string, { intent: StudioStreamClosureIntent; expiresAt: number }>();

function intentKey(sessionId: string): string {
  return `vl:studio:intent:${sessionId}`;
}

function setLocalIntent(sessionId: string, intent: StudioStreamClosureIntent): void {
  localIntents.set(sessionId, {
    intent,
    expiresAt: Date.now() + STUDIO_STREAM_INTENT_TTL_SECONDS * 1000,
  });
}

function getLocalIntent(sessionId: string): StudioStreamClosureIntent | null {
  const entry = localIntents.get(sessionId);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    localIntents.delete(sessionId);
    return null;
  }

  return entry.intent;
}

export async function setStudioStreamClosureIntent(
  sessionId: string,
  intent: StudioStreamClosureIntent,
): Promise<void> {
  setLocalIntent(sessionId, intent);

  const redis = await getRedisClient();
  if (!redis) return;

  await redis.set(intentKey(sessionId), intent, { EX: STUDIO_STREAM_INTENT_TTL_SECONDS });
}

export async function getStudioStreamClosureIntent(sessionId: string): Promise<StudioStreamClosureIntent | null> {
  const redis = await getRedisClient();
  if (!redis) return getLocalIntent(sessionId);

  const intent = await redis.get(intentKey(sessionId));
  return intent === 'pause' || intent === 'end' ? intent : getLocalIntent(sessionId);
}

export async function clearStudioStreamClosureIntent(sessionId: string): Promise<void> {
  localIntents.delete(sessionId);

  const redis = await getRedisClient();
  if (!redis) return;

  await redis.del(intentKey(sessionId));
}
