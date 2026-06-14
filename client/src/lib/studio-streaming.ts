export interface StudioStreamStatusResponse {
  sessionId: string;
  isLive: boolean;
  isPaused: boolean;
  streamUrl: string | null;
}

function getStudioBackendBaseUrl(): string {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return '';
  }

  return `${window.location.protocol}//${window.location.hostname}:5000`;
}

export function getStudioStreamIngestUrl(sessionId: string, publicationRequested: boolean = true): string {
  return `${getStudioBackendBaseUrl()}/api/studio/stream/${sessionId}?record=${publicationRequested ? 'true' : 'false'}`;
}

export function getStudioStreamStatusUrl(sessionId: string): string {
  return `${getStudioBackendBaseUrl()}/api/studio/stream/${sessionId}/status`;
}
