import { apiRequest } from '@/lib/queryClient';

export interface AddSessionReactionPayload {
  sessionId: string;
  emoji: string;
  type?: 'positive' | 'negative';
  position?: string;
  audioTimestampMs?: number;
  chapterNumber?: number;
}

export const reactionsApi = {
  addReaction: (payload: AddSessionReactionPayload) =>
    apiRequest<{ success: boolean; reaction: unknown }>('/api/reactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
