import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAccessToken, syncTokenFromCookie, isTokenExpired } from "./token-store";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Re-export token functions for backward compatibility
export { getAccessToken as getAuthToken, setAccessToken as setAuthToken } from "./token-store";

// Обновить access token через refresh token
let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
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

      // Синхронизируем обновленный accessToken из cookie в память
      syncTokenFromCookie();
      
      // Уведомляем приложение об успешном обновлении токена
      globalThis.dispatchEvent(new CustomEvent('token-refreshed'));
    } catch (error) {
      // При ошибке обновления уведомляем об ошибке авторизации
      console.error('Token refresh failed:', error);
      globalThis.dispatchEvent(new CustomEvent('auth-error'));
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
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...additionalHeaders,
  };

  // Только если токен существует и не null
  if (token && token !== 'null') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Authenticated fetch helper
 * Автоматически добавляет Authorization header, если токен доступен
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = createAuthHeaders(
    options.headers as Record<string, string> || {}
  );
  
  return fetch(url, {
    ...options,
    headers,
  });
}

// Обработка ошибок 403 с различными кодами
async function handle403Error(res: Response, text: string): Promise<never> {
  try {
    const errorData = JSON.parse(text);
    
    if (errorData.code === 'ACCOUNT_NOT_ACTIVATED') {
      const statusMessages: Record<string, string> = {
        pending: 'Ваш аккаунт ожидает активации администратором.',
        suspended: 'Ваш аккаунт заблокирован.',
      };
      const statusMessage = statusMessages[errorData.userStatus] || 'Ваш аккаунт неактивен.';
      
      globalThis.dispatchEvent(new CustomEvent('account-status-changed', { 
        detail: { status: errorData.userStatus } 
      }));
      
      throw new Error(statusMessage);
    }
    
    if (errorData.code === 'EMAIL_NOT_CONFIRMED') {
      globalThis.dispatchEvent(new CustomEvent('email-verification-required'));
      throw new Error('Необходимо подтвердить email для доступа к этой функции.');
    }
    
    if (errorData.code === 'PRIVATE_CLUB_ACCESS_DENIED') {
      throw new Error(errorData.message || 'Это закрытый клуб. Для доступа необходимо получить приглашение.');
    }
    
    throw new Error(errorData.message || text || res.statusText);
  } catch (parseError) {
    if (parseError instanceof SyntaxError) {
      throw new Error(text || res.statusText);
    }
    throw parseError;
  }
}

// Обработка неуспешных ответов
async function handleErrorResponse(res: Response, url?: string): Promise<never> {
  const text = await res.text();
  
  if (res.status === 401) {
    // Для endpoint логина показываем более точное сообщение
    if (url?.includes('/api/auth/login')) {
      try {
        const errorData = JSON.parse(text);
        throw new Error(errorData.message || 'Неверный логин или пароль');
      } catch (e) {
        if (e instanceof Error) throw e;
        throw new Error('Неверный логин или пароль');
      }
    }
    throw new Error('Требуется авторизация. Пожалуйста, войдите в систему.');
  }
  
  if (res.status === 403) {
    return handle403Error(res, text);
  }
  
  // Пытаемся извлечь message из JSON для всех остальных ошибок
  try {
    const errorData = JSON.parse(text);
    if (errorData.message) {
      throw new Error(errorData.message);
    }
  } catch (parseError) {
    // Если не JSON или нет message, используем text как есть
    if (!(parseError instanceof SyntaxError)) {
      throw parseError;
    }
  }
  
  throw new Error(text || res.statusText);
}

// Попытка обновить токен перед запросом
// Проверяем только если токен есть и истек
async function tryRefreshTokenBeforeRequest(): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    // Нет токена - пользователь не авторизован, пропускаем проверку
    return;
  }
  
  if (isTokenExpired(token)) {
    try {
      await refreshAccessToken();
    } catch (error) {
      console.error('Token refresh failed before request:', error);
      // При ошибке продолжаем, запрос вернет 401 и повторится
    }
  }
}

// Повторить запрос после обновления токена
async function retryRequestAfter401(
  url: string,
  options: RequestInit | undefined,
  isFormData: boolean
): Promise<Response | null> {
  // Не пытаемся refresh для самого refresh endpoint (избегаем бесконечных циклов)
  if (url.includes('/api/auth/refresh') || url.includes('/api/auth/login') || url.includes('/api/auth/register')) {
    return null;
  }

  try {
    await refreshAccessToken();
    
    // Синхронизируем обновленный токен
    syncTokenFromCookie();
    
    const newHeaders = createAuthHeaders(
      !isFormData && options?.body ? { "Content-Type": "application/json" } : {}
    );

    return await fetch(url, {
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
    // При ошибке обновления токен будет автоматически очищен на сервере
    return null;
  }
}

export async function apiRequest<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const isFormData = options?.body instanceof FormData;

  // Убираем предварительную проверку токена - используем только retry после 401
  // Это устраняет race condition и избыточные запросы

  const headers = createAuthHeaders(
    !isFormData && options?.body ? { "Content-Type": "application/json" } : {}
  );

  let res = await fetch(url, {
    method: options?.method || 'GET',
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string>),
    },
    body: options?.body,
    credentials: "include",
  });

  if (res.status === 401) {
    const retryRes = await retryRequestAfter401(url, options, isFormData);
    if (retryRes) {
      res = retryRes;
    }
  }

  if (!res.ok) {
    await handleErrorResponse(res, url);
  }

  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return await res.json() as T;
  }

  return undefined as T;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      // При httpOnly cookies токен автоматически передается с запросом
      // и проверяется на сервере. Не нужно дополнительных проверок.

      const headers = createAuthHeaders();

      let res = await fetch(queryKey.join("/"), {
        headers,
        credentials: "include",
      });

      // Если получили 401, пробуем обновить токен
      if (res.status === 401) {
        try {
          await refreshAccessToken();
          
          // Повторяем запрос с обновленным токеном (в cookie)
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
