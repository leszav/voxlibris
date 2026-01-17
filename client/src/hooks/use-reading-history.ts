import { apiRequest } from "@/lib/queryClient";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import type { ReadingHistory } from "@shared/schema";

// Reading History hook
export function useReadingHistory() {
  return useQuery({
    queryKey: ["reading-history"],
    queryFn: async (): Promise<ReadingHistory[]> => {
      return apiRequest<ReadingHistory[]>("/api/v1/user/books/history");
    },
  });
}

// Clear reading history hook
export function useClearReadingHistory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (): Promise<{ message: string }> => {
      return apiRequest("/api/v1/user/books/history", {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reading-history"] });
    },
  });
}