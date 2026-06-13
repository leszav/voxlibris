import { apiRequest } from '@/lib/queryClient';

export type DominantEmotion = 'joy' | 'sadness' | 'excitement' | 'tension' | 'neutral';

export interface EmotionalMapReactionBucket {
  emoji: string;
  count: number;
  percentage: number;
}

export interface EmotionalMapPoint {
  timestampMs: number;
  chapterNumber: number | null;
  reactions: EmotionalMapReactionBucket[];
  totalReactions: number;
  chatMessageCount: number;
  dominantEmotion: DominantEmotion;
}

export interface EmotionalMapHighlight {
  timestampMs: number;
  reason: string;
  reactionCount: number;
  dominantEmotion: DominantEmotion;
}

export interface EmotionalMap {
  sessionId: string;
  totalDurationMs: number;
  windowSizeMs: number;
  points: EmotionalMapPoint[];
  highlights: EmotionalMapHighlight[];
  stats: {
    totalReactions: number;
    totalChatMessages: number;
    dominantEmotion: DominantEmotion;
    peakTimestampMs: number | null;
  };
}

function buildMapUrl(sessionId: string, windowSizeMs?: number): string {
  const params = new URLSearchParams();
  if (windowSizeMs !== undefined) {
    params.set('windowSizeMs', String(windowSizeMs));
  }

  const query = params.toString();
  return `/api/reading-sessions/${sessionId}/emotional-map${query ? `?${query}` : ''}`;
}

export const emotionalMapApi = {
  getEmotionalMap: (sessionId: string, windowSizeMs?: number) =>
    apiRequest<EmotionalMap>(buildMapUrl(sessionId, windowSizeMs)),
  getHighlights: (sessionId: string) =>
    apiRequest<EmotionalMapHighlight[]>(`/api/reading-sessions/${sessionId}/highlights`),
};
