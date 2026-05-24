# Интеграция с API

## Обзор

В этом разделе описано взаимодействие клиентской части приложения VoxLibris с серверным API. Клиент использует HTTP-запросы для получения и отправки данных на сервер.

## Структура файлов

Файлы интеграции с API находятся в следующих директориях:

```
client/src/
├── lib/
│   ├── api.ts
│   └── constants.ts
├── services/
│   ├── auth-service.ts
│   ├── club-service.ts
│   ├── book-service.ts
│   ├── session-service.ts
│   ├── notification-service.ts
│   └── ...
├── hooks/
│   ├── use-auth.ts
│   ├── use-api.ts
│   ├── use-clubs.ts
│   ├── use-books.ts
│   └── ...
└── types/
    ├── api.ts
    └── ...
```

## Базовая настройка API

### client/src/lib/api.ts

Файл, содержащий основную конфигурацию для всех API-запросов:

```typescript
import axios from 'axios';
import { API_BASE_URL } from './constants';

// Создание экземпляра axios с базовыми настройками
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Интерцептор для добавления токена авторизации
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Интерцептор для обработки ошибок и обновления токена
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Если токен истек и это не повторная попытка
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken } = response.data;
        localStorage.setItem('access_token', accessToken);

        // Повтор запроса с новым токеном
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Если не удалось обновить токен, перенаправляем на логин
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

### client/src/lib/constants.ts

Файл с константами для API:

```typescript
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:5000';

// Таймауты
export const REQUEST_TIMEOUT = 10000; // 10 секунд

// Коды ошибок
export const ERROR_CODES = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
} as const;
```

## Сервисы API

### client/src/services/auth-service.ts

Сервис для аутентификации:

```typescript
import api from '@/lib/api';
import { User } from '@/types/user';

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
}

interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  async register(userData: RegisterData): Promise<LoginResponse> {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },

  async refresh(refreshToken: string): Promise<{ accessToken: string; user: User }> {
    const response = await api.post('/auth/refresh', { refreshToken });
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await api.get('/users/profile');
    return response.data;
  },
};
```

### client/src/services/club-service.ts

Сервис для работы с клубами:

```typescript
import api from '@/lib/api';
import { Club, CreateClubData, UpdateClubData } from '@/types/club';

export const clubService = {
  async getPublicClubs(limit?: number, offset?: number): Promise<Club[]> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());

    const response = await api.get('/clubs', { params });
    return response.data;
  },

  async getUserClubs(): Promise<Club[]> {
    const response = await api.get('/clubs/my');
    return response.data;
  },

  async getClubById(id: number): Promise<Club> {
    const response = await api.get(`/clubs/${id}`);
    return response.data;
  },

  async createClub(clubData: CreateClubData): Promise<Club> {
    const response = await api.post('/clubs', clubData);
    return response.data;
  },

  async updateClub(id: number, clubData: UpdateClubData): Promise<Club> {
    const response = await api.put(`/clubs/${id}`, clubData);
    return response.data;
  },

  async deleteClub(id: number): Promise<void> {
    await api.delete(`/clubs/${id}`);
  },

  async joinClub(clubId: number, token: string): Promise<void> {
    await api.post(`/clubs/${clubId}/join/${token}`);
  },

  async inviteMember(clubId: number): Promise<string> {
    const response = await api.post(`/clubs/${clubId}/invite`);
    return response.data.invitationToken;
  },
};
```

## Пользовательские хуки

### client/src/hooks/use-api.ts

Базовый хук для работы с API:

```typescript
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useState, useEffect } from 'react';

interface ApiHookOptions {
  staleTime?: number;
  cacheTime?: number;
  refetchOnWindowFocus?: boolean;
}

export const useApi = <TData, TVariables = void>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  options?: ApiHookOptions
) => {
  const [data, setData] = useState<TData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await queryFn();
        setData(result);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { data, loading, error, refetch: () => fetchData() };
};
```

### client/src/hooks/use-clubs.ts

Хук для получения данных о клубах:

```typescript
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { clubService } from '@/services/club-service';
import { Club, CreateClubData } from '@/types/club';

interface UseClubsOptions {
  type?: 'public' | 'my';
  enabled?: boolean;
}

export const useClubs = (options: UseClubsOptions = {}) => {
  const { type = 'my', enabled = true } = options;
  const queryClient = useQueryClient();

  const queryResult = useQuery<Club[], Error>(
    ['clubs', type],
    async () => {
      if (type === 'public') {
        return clubService.getPublicClubs();
      } else {
        return clubService.getUserClubs();
      }
    },
    {
      enabled,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    }
  );

  const createClubMutation = useMutation(
    (clubData: CreateClubData) => clubService.createClub(clubData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['clubs']);
      },
    }
  );

  const joinClubMutation = useMutation(
    ({ clubId, token }: { clubId: number; token: string }) => 
      clubService.joinClub(clubId, token),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['clubs']);
        queryClient.invalidateQueries(['clubs', 'public']);
      },
    }
  );

  return {
    ...queryResult,
    createClub: createClubMutation.mutate,
    createClubLoading: createClubMutation.isLoading,
    joinClub: joinClubMutation.mutate,
    joinClubLoading: joinClubMutation.isLoading,
  };
};
```

### client/src/hooks/use-auth.ts

Хук для управления состоянием аутентификации:

```typescript
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { authService } from '@/services/auth-service';
import { User } from '@/types/user';

interface UseAuthReturn {
  user: User | null;
  login: (credentials: { email: string; password: string }) => void;
  loginLoading: boolean;
  register: (userData: { email: string; password: string; name: string }) => void;
  registerLoading: boolean;
  logout: () => void;
  isAuthenticated: boolean;
  error: string | null;
}

export const useAuth = (): UseAuthReturn => {
  const queryClient = useQueryClient();

  // Получение текущего пользователя
  const { data: user, isLoading } = useQuery<User | null, Error>(
    'currentUser',
    authService.getCurrentUser,
    {
      retry: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      onError: () => {
        // Если запрос неудачен, пользователь не аутентифицирован
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      },
    }
  );

  // Мутация для логина
  const loginMutation = useMutation(
    (credentials: { email: string; password: string }) => 
      authService.login(credentials),
    {
      onSuccess: (data) => {
        // Сохраняем токены
        localStorage.setItem('access_token', data.accessToken);
        localStorage.setItem('refresh_token', data.refreshToken);
        
        // Сохраняем данные пользователя
        queryClient.setQueryData('currentUser', data.user);
      },
    }
  );

  // Мутация для регистрации
  const registerMutation = useMutation(
    (userData: { email: string; password: string; name: string }) => 
      authService.register(userData),
    {
      onSuccess: (data) => {
        // Сохраняем токены
        localStorage.setItem('access_token', data.accessToken);
        localStorage.setItem('refresh_token', data.refreshToken);
        
        // Сохраняем данные пользователя
        queryClient.setQueryData('currentUser', data.user);
      },
    }
  );

  // Мутация для логаута
  const logoutMutation = useMutation(authService.logout, {
    onSuccess: () => {
      // Удаляем токены
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      
      // Удаляем данные пользователя
      queryClient.removeQueries('currentUser');
    },
  });

  return {
    user,
    login: loginMutation.mutate,
    loginLoading: loginMutation.isLoading,
    register: registerMutation.mutate,
    registerLoading: registerMutation.isLoading,
    logout: logoutMutation.mutate,
    isAuthenticated: !!user && !isLoading,
    error: loginMutation.error?.message || 
           registerMutation.error?.message || 
           logoutMutation.error?.message || 
           null,
  };
};
```

## Обработка ошибок

### Обработка HTTP ошибок

Все сервисы API должны корректно обрабатывать ошибки:

```typescript
// client/src/services/book-service.ts
import api from '@/lib/api';
import { AxiosError } from 'axios';
import { Book } from '@/types/book';

export const bookService = {
  async uploadBook(file: File, clubId?: number): Promise<Book> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/books/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        // Обработка специфичных ошибок API
        switch (error.response?.status) {
          case 400:
            throw new Error('Invalid file format or size');
          case 401:
            throw new Error('Authentication required');
          case 403:
            throw new Error('Insufficient permissions');
          case 413:
            throw new Error('File too large');
          default:
            throw new Error('Failed to upload book');
        }
      }
      throw error;
    }
  },
};
```

### Глобальная обработка ошибок

В компонентах можно использовать обертку для отображения ошибок:

```tsx
// client/src/components/error-boundary.tsx
import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center">
          <h2 className="text-xl font-bold text-red-500">Something went wrong</h2>
          <p className="text-muted-foreground mt-2">{this.state.error?.message}</p>
          <button 
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## Загрузка файлов

Для загрузки файлов (например, книг или обложек) используется специальная обработка:

```typescript
// client/src/services/book-service.ts
export const bookService = {
  // ... другие методы ...
  
  async uploadBook(file: File, clubId?: number): Promise<Book> {
    const formData = new FormData();
    formData.append('file', file);
    if (clubId) {
      formData.append('clubId', clubId.toString());
    }

    const response = await api.post('/books/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total!
        );
        console.log(`Upload progress: ${percentCompleted}%`);
      },
    });

    return response.data;
  },
};
```

## WebSocket интеграция

Для работы в реальном времени используется WebSocket:

```typescript
// client/src/hooks/use-websocket.ts
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_BASE_URL } from '@/lib/constants';

interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  sendMessage: (event: string, data: any) => void;
}

export const useWebSocket = (namespace: string): UseWebSocketReturn => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const wsUrl = `${WS_BASE_URL}${namespace}`;
    const newSocket = io(wsUrl, {
      transports: ['websocket'],
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to WebSocket');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from WebSocket');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [namespace]);

  const sendMessage = (event: string, data: any) => {
    if (socket) {
      socket.emit(event, data);
    }
  };

  return {
    socket,
    isConnected,
    sendMessage,
  };
};
```

## Кэширование и оптимизация

React Query используется для кэширования данных:

```typescript
// client/src/hooks/use-books.ts
import { useQuery } from 'react-query';
import { bookService } from '@/services/book-service';
import { Book } from '@/types/book';

export const useBooks = () => {
  return useQuery<Book[], Error>(
    'books', 
    bookService.getUserBooks,
    {
      staleTime: 1 * 60 * 1000, // 1 minute
      cacheTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false, // Отключаем автообновление при фокусе
    }
  );
};
```

## Рекомендации

1. Используйте интерцепторы axios для обработки аутентификации
2. Обрабатывайте ошибки на уровне сервисов
3. Используйте React Query для управления состоянием и кэширования
4. Валидируйте данные перед отправкой на сервер
5. Показывайте пользователю прогресс загрузки файлов
6. Используйте типизацию для ответов API
7. Обновляйте кэш после мутаций
8. Используйте WebSocket для обновлений в реальном времени
9. Обрабатывайте ошибки сети и повторяйте запросы при необходимости
10. Следите за безопасностью передаваемых данных