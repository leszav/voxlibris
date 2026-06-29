import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';

interface ReaderStatusResponse {
  isReaderClubOwner: boolean;
  clubId?: string;
  clubTitle?: string;
}

export function useReaderStatus() {
  return useQuery<ReaderStatusResponse>({
    queryKey: ['reader-status'],
    queryFn: async (): Promise<ReaderStatusResponse> => {
      try {
        const response = await apiRequest<ReaderStatusResponse>('/api/v1/reader/status');
        return response;
      } catch (error: unknown) {
        // Если ошибка 403 или 404 - пользователь не reader-club owner
        if (error && typeof error === 'object' && 'status' in error && (error.status === 403 || error.status === 404)) {
          return { isReaderClubOwner: false };
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 минут
    retry: false,
  });
}
