import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Получить JWT токен из localStorage
function getAuthToken(): string | null {
  try {
    return localStorage.getItem('accessToken');
  } catch {
    return null;
  }
}

// Сохранить токен в localStorage
function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem('accessToken', token);
    } else {
      localStorage.removeItem('accessToken');
    }
  } catch {
    // Игнорируем ошибки localStorage
  }
}

// Проверить, истек ли токен
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
  } catch {
    return true;
  }
}

// Обновить access token через refresh token
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  // Защита от одновременных запросов на обновление
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // Для отправки httpOnly refresh cookie
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      const data = await response.json();
      setAuthToken(data.accessToken);
      
      // Уведомляем приложение об успешном обновлении токена
      globalThis.dispatchEvent(new CustomEvent('token-refreshed'));
      
      return data.accessToken;
    } catch (error) {
      // При ошибке обновления очищаем токен
      setAuthToken(null);
      throw error;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Создать заголовки с аутентификацией
function createAuthHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...additionalHeaders,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export async function apiRequest<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const isFormData = options?.body instanceof FormData;

  // Проверяем токен перед запросом
  const token = getAuthToken();
  if (token && isTokenExpired(token)) {
    try {
      await refreshAccessToken();
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Не выбрасываем ошибку сразу - возможно запрос публичный
      // Очищаем токен и продолжаем запрос без авторизации
      setAuthToken(null);
    }
  }

  const headers = createAuthHeaders(
    // Не устанавливаем Content-Type для FormData - браузер сделает это автоматически с boundary
    !isFormData && options?.body ? { "Content-Type": "application/json" } : {}
  );

  let res = await fetch(url, {
    method: options?.method || 'GET',
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string>),
    },
    body: options?.body,
    credentials: "include", // Сохраняем для refresh токенов в cookies
  });

  // Если получили 401 и есть токен, пробуем обновить токен один раз
  if (res.status === 401 && getAuthToken()) {
    try {
      await refreshAccessToken();
      
      // Повторяем запрос с новым токеном
      const newHeaders = createAuthHeaders(
        !isFormData && options?.body ? { "Content-Type": "application/json" } : {}
      );

      res = await fetch(url, {
        method: options?.method || 'GET',
        headers: {
          ...newHeaders,
          ...(options?.headers as Record<string, string>),
        },
        body: options?.body,
        credentials: "include",
      });
    } catch (error) {
      console.error('Token refresh failed on 401:', error);
      setAuthToken(null);
      // Не выбрасываем ошибку, а возвращаем 401 как есть - UI обработает
    }
  }

  // Проверяем статус ответа и обрабатываем специфичные ошибки
  if (!res.ok) {
    const text = await res.text();
    
    // Обрабатываем ошибки 401 - требуется авторизация
    if (res.status === 401) {
      throw new Error('Требуется авторизация. Пожалуйста, войдите в систему.');
    }
    
    // Обрабатываем ошибки 403
    if (res.status === 403) {
      try {
        const errorData = JSON.parse(text);
        
        // Ошибка активации аккаунта
        if (errorData.code === 'ACCOUNT_NOT_ACTIVATED') {
          let statusMessage = 'Ваш аккаунт неактивен.';
          if (errorData.userStatus === 'pending') statusMessage = 'Ваш аккаунт ожидает активации администратором.';
          else if (errorData.userStatus === 'suspended') statusMessage = 'Ваш аккаунт заблокирован.';
          
          // Генерируем событие для обновления состояния пользователя
          globalThis.dispatchEvent(new CustomEvent('account-status-changed', { 
            detail: { status: errorData.userStatus } 
          }));
          
          throw new Error(statusMessage);
        }
        
        // Ошибка доступа к приватному клубу
        if (errorData.code === 'PRIVATE_CLUB_ACCESS_DENIED') {
          throw new Error(errorData.message || 'Это закрытый клуб. Для доступа необходимо получить приглашение.');
        }
        
        // Если JSON распарсился, используем message из ответа
        throw new Error(errorData.message || text || res.statusText);
      } catch (parseError) {
        // Если не смогли распарсить JSON, это может быть обычная текстовая ошибка
        if (parseError instanceof SyntaxError) {
          throw new Error(text || res.statusText);
        }
        // Если это другая ошибка (например, из блока if выше), пробрасываем её
        throw parseError;
      }
    }
    
    // Для других ошибок
    throw new Error(`${res.status}: ${text}`);
  }

  // Проверяем, есть ли контент для парсинга
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return await res.json() as T;
  }

  // Для пустых ответов или non-JSON возвращаем как есть
  return undefined as T;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      // Проверяем токен перед запросом
      const token = getAuthToken();
      if (token && isTokenExpired(token)) {
        try {
          await refreshAccessToken();
        } catch (error) {
          if (unauthorizedBehavior === "returnNull") {
            return null;
          }
          throw error;
        }
      }

      const headers = createAuthHeaders();

      let res = await fetch(queryKey.join("/"), {
        headers,
        credentials: "include",
      });

      // Если получили 401, пробуем обновить токен
      if (res.status === 401) {
        try {
          await refreshAccessToken();
          
          // Повторяем запрос с новым токеном
          const newHeaders = createAuthHeaders();
          res = await fetch(queryKey.join("/"), {
            headers: newHeaders,
            credentials: "include",
          });
        } catch (error) {
          if (unauthorizedBehavior === "returnNull") {
            return null;
          }
          throw error;
        }
      }

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
