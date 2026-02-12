import { apiRequest } from "@/lib/queryClient";

// Типы для API ответов
export interface ClubBook {
  id: string;
  clubId: string;
  bookId: string;
  addedBy: string;
  addedAt: string;
  isDeleted: boolean;
  book?: {
    id: string;
    title: string;
    author: string;
    coverUrl?: string;
  };
}

export interface ClubReadingPlan {
  id: string;
  clubBookId: string;
  title: string;
  description?: string;
  orderIndex: number;
  startChapter?: number;
  endChapter?: number;
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClubReadingPlanProgress {
  id: string;
  planId: string;
  userId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface ClubBookmark {
  id: string;
  clubBookId: string;
  createdBy: string;
  position: number;
  chapter?: number;
  title: string;
  description?: string;
  createdAt: string;
  username?: string;
  displayName?: string;
}

export interface MemberProgress {
  userId: string;
  username: string;
  displayName?: string;
  currentChapter?: number;
  progress?: number;
  lastReadAt?: string;
}

export interface ReadingPlanResponse {
  clubBook: ClubBook;
  plan: ClubReadingPlan[];
  progress: ClubReadingPlanProgress[];
}

// API запросы для плана чтения
export const clubReaderApi = {
  // Получение плана чтения клуба
  getReadingPlan: async (clubId: string): Promise<ReadingPlanResponse> => {
    return apiRequest(`/api/clubs/${clubId}/reading-plan`);
  },

  // Создание этапа плана чтения
  createReadingPlan: async (clubId: string, data: {
    title: string;
    description?: string;
    orderIndex: number;
    startChapter?: number;
    endChapter?: number;
    targetDate?: string;
  }): Promise<ClubReadingPlan> => {
    return apiRequest(`/api/clubs/${clubId}/reading-plan`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Обновление этапа плана чтения
  updateReadingPlan: async (clubId: string, planId: string, data: {
    title?: string;
    description?: string;
    orderIndex?: number;
    startChapter?: number;
    endChapter?: number;
    targetDate?: string;
  }): Promise<ClubReadingPlan> => {
    return apiRequest(`/api/clubs/${clubId}/reading-plan/${planId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Удаление этапа плана чтения
  deleteReadingPlan: async (clubId: string, planId: string): Promise<void> => {
    return apiRequest(`/api/clubs/${clubId}/reading-plan/${planId}`, {
      method: 'DELETE',
    });
  },

  // Обновление статуса этапа плана для текущего пользователя
  updatePlanStatus: async (clubId: string, planId: string, status: 'not_started' | 'in_progress' | 'completed'): Promise<{ success: boolean; status: string }> => {
    return apiRequest(`/api/clubs/${clubId}/reading-plan/${planId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Обновление прогресса чтения участника
  updateProgress: async (clubId: string, data: {
    currentChapter: number;
    currentPosition: string;
    progress: number;
  }): Promise<{ success: boolean; updatedPlanStatus: Array<{ planId: string; status: string }> }> => {
    return apiRequest(`/api/clubs/${clubId}/progress`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Получение прогресса всех членов клуба
  getMembersProgress: async (clubId: string): Promise<MemberProgress[]> => {
    return apiRequest(`/api/clubs/${clubId}/members-progress`);
  },

  // Получение закладок клуба
  getBookmarks: async (clubId: string): Promise<ClubBookmark[]> => {
    return apiRequest(`/api/clubs/${clubId}/bookmarks`);
  },

  // Создание закладки
  createBookmark: async (clubId: string, data: {
    position: number;
    chapter?: number;
    title: string;
    description?: string;
  }): Promise<ClubBookmark> => {
    return apiRequest(`/api/clubs/${clubId}/bookmarks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Удаление закладки
  deleteBookmark: async (clubId: string, bookmarkId: string): Promise<void> => {
    return apiRequest(`/api/clubs/${clubId}/bookmarks/${bookmarkId}`, {
      method: 'DELETE',
    });
  },
};