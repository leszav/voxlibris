import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAccessToken, setAccessToken, isTokenExpired } from "./token-store";

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
      setAccessToken(data.accessToken);
      
      // Уведомляем приложение об успешном обновлении токена
      globalThis.dispatchEvent(new CustomEvent('token-refreshed'));
      
      return data.accessToken;
    } catch (error) {
      // При ошибке обновления очищаем токен
      setAccessToken(null);
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

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
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
async function handleErrorResponse(res: Response): Promise<never> {
  const text = await res.text();
  
  if (res.status === 401) {
    throw new Error('Требуется авторизация. Пожалуйста, войдите в систему.');
  }
  
  if (res.status === 403) {
    return handle403Error(res, text);
  }
  
  throw new Error(`${res.status}: ${text}`);
}

// Попытка обновить токен перед запросом
async function tryRefreshTokenBeforeRequest(): Promise<void> {
  const token = getAccessToken();
  if (!token || !isTokenExpired(token)) {
    return;
  }

  try {
    await refreshAccessToken();
  } catch (error) {
    console.error('Token refresh failed:', error);
    setAccessToken(null);
  }
}

// Повторить запрос после обновления токена
async function retryRequestAfter401(
  url: string,
  options: RequestInit | undefined,
  isFormData: boolean
): Promise<Response | null> {
  if (!getAccessToken()) {
    return null;
  }

  try {
    await refreshAccessToken();
    
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
    setAccessToken(null);
    return null;
  }
}

export async function apiRequest<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const isFormData = options?.body instanceof FormData;

  await tryRefreshTokenBeforeRequest();

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
    await handleErrorResponse(res);
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
      // Проверяем токен перед запросом
      const token = getAccessToken();
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
