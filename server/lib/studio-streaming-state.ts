import { getIcecastStreamUrl } from './icecast-public-url.js';

export interface ActiveStudioStreamEntry {
  mountPath: string;
  recordingPath: string;
}

const activeStudioStreams = new Map<string, ActiveStudioStreamEntry>();

export function getStudioMountPath(sessionId: string): string {
  return `/live/${sessionId}.mp3`;
}

export function getStudioPublicStreamUrl(sessionId: string): string {
  return getIcecastStreamUrl(sessionId);
}

export function hasActiveStudioStream(sessionId: string): boolean {
  return activeStudioStreams.has(sessionId);
}

export function getActiveStudioStream(sessionId: string): ActiveStudioStreamEntry | null {
  return activeStudioStreams.get(sessionId) ?? null;
}

export function setActiveStudioStream(sessionId: string, entry: ActiveStudioStreamEntry): void {
  activeStudioStreams.set(sessionId, entry);
}

export function clearActiveStudioStream(sessionId: string): void {
  activeStudioStreams.delete(sessionId);
}
