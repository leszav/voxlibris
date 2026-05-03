import { getAccessToken } from '@/lib/token-store';
import { getStudioStreamIngestUrl } from '@/lib/studio-streaming';

export interface StartStudioStreamIngestOptions {
  sessionId: string;
  mimeType: string;
  body: ReadableStream<Uint8Array>;
  signal: AbortSignal;
}

export function startStudioStreamIngest({
  sessionId,
  mimeType,
  body,
  signal,
}: StartStudioStreamIngestOptions): Promise<Response> {
  const token = getAccessToken();

  return fetch(getStudioStreamIngestUrl(sessionId), {
    method: 'POST',
    // @ts-expect-error duplex не в стандартных типах TS, но нужен для request streaming
    duplex: 'half',
    body,
    headers: {
      'Content-Type': mimeType,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    signal,
    credentials: 'include',
  });
}
