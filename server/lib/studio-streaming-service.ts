import { storage } from '../repositories/index.js';
import { getStudioPublicStreamUrl, hasActiveStudioStream } from './studio-streaming-state.js';

export interface StudioStreamSessionValidationResult {
  ok: boolean;
  status: number;
  error?: string;
  session?: Awaited<ReturnType<typeof storage.getReadingSession>>;
}

export interface StudioStreamStatusPayload {
  sessionId: string;
  isLive: boolean;
  isPaused: boolean;
  streamUrl: string | null;
}

export async function resolveStudioStreamSessionForReader(
  sessionId: string,
  userId: string,
): Promise<StudioStreamSessionValidationResult> {
  let session: Awaited<ReturnType<typeof storage.getReadingSession>>;

  try {
    session = await storage.getReadingSession(sessionId);
  } catch {
    return {
      ok: false,
      status: 500,
      error: 'Internal Server Error',
    };
  }

  if (!session) {
    return {
      ok: false,
      status: 404,
      error: 'Reading session not found',
    };
  }

  if (session.readerId !== userId) {
    return {
      ok: false,
      status: 403,
      error: 'Only the session reader can stream audio',
      session,
    };
  }

  if (!session.isActive) {
    return {
      ok: false,
      status: 409,
      error: 'Reading session is not active',
      session,
    };
  }

  return {
    ok: true,
    status: 200,
    session,
  };
}

export async function buildStudioStreamStatus(sessionId: string): Promise<{
  ok: boolean;
  status: number;
  error?: string;
  payload?: StudioStreamStatusPayload;
}> {
  let session: Awaited<ReturnType<typeof storage.getReadingSession>>;

  try {
    session = await storage.getReadingSession(sessionId);
  } catch {
    return {
      ok: false,
      status: 500,
      error: 'Internal Server Error',
    };
  }

  if (!session) {
    return {
      ok: false,
      status: 404,
      error: 'Session not found',
    };
  }

  const hasLiveStream = hasActiveStudioStream(sessionId);

  return {
    ok: true,
    status: 200,
    payload: {
      sessionId,
      isLive: hasLiveStream,
      isPaused: session.isActive && !hasLiveStream,
      streamUrl: hasLiveStream
        ? getStudioPublicStreamUrl(sessionId)
        : null,
    },
  };
}
