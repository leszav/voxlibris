import React, { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import { User } from '../../../shared/schema';
import { authAPI } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (username: string, email: string, password: string, rememberMe?: boolean, inviteToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
  syncAuthState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  readonly children: ReactNode;
}

// Ключ для хранения кэша пользователя
const USER_CACHE_KEY = 'voxlibris_user_cache';

export function AuthProvider({ children }: AuthProviderProps) {
  // Оптимистичная загрузка: загружаем пользователя из localStorage
  // Не проверяем токен здесь - это будет сделано в фоне через useEffect
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem(USER_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Ignore cache errors
    }
    return null;
  });
 const [isLoading, setIsLoading] = useState(false);

  const isAuthenticated = !!user;

  // Кэширование пользователя в localStorage
  const cacheUser = (userData: User | null) => {
    try {
      if (userData) {
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
      } else {
        localStorage.removeItem(USER_CACHE_KEY);
      }
    } catch {
      // localStorage может быть недоступен
    }
  };

  const fetchCurrentUser = async () => {
    try {
      // При первой загрузке accessToken может отсутствовать в памяти,
      // но refreshToken есть в httpOnly cookie. Пробуем восстановить сессию.
      if (!authAPI.isAuthenticated()) {
        // Попытка восстановить сессию через refresh token в cookie
        const refreshSuccess = await authAPI.forceRefreshToken();
        if (!refreshSuccess) {
          // Не очищаем user - оставляем кэшированного для offline-first UX
          // Сервер сам пришлёт 401 если сессия истекла
          return;
        }
      }

      // Получаем актуальные данные пользователя с сервера
      const response = await authAPI.getCurrentUser();
      setUser(response.user);
      cacheUser(response.user);
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch current user:', error);
      }
      
      // Очищаем ТОЛЬКО при явном 401/403 от сервера (сессия невалидна)
      const err = error as { response?: { status?: number } };
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        authAPI.clearTokens();
        setUser(null);
        cacheUser(null);
      }
      // При других ошибках (сеть, таймаут) - оставляем кэшированного user
    }
  };

  const login = async (username: string, password: string, rememberMe: boolean = false) => {
    try {
      const response = await authAPI.login({ username, password, rememberMe });
      setUser(response.user);
      cacheUser(response.user);
    } catch (error) {
      // Очищаем состояние при неудачном входе
      authAPI.clearTokens();
      setUser(null);
      cacheUser(null);
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string, rememberMe: boolean = false, inviteToken?: string) => {
    try {
      const payload: { username: string; email: string; password: string; rememberMe: boolean; invite?: string } = {
        username,
        email,
        password,
        rememberMe,
      };
      if (inviteToken) payload.invite = inviteToken;
      const response = await authAPI.register(payload);
      setUser(response.user);
      cacheUser(response.user);
    } catch (error) {
      // Очищаем состояние при неудачной регистрации
      authAPI.clearTokens();
      setUser(null);
      cacheUser(null);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Logout request failed:', error);
      }
      // Продолжаем выход даже если запрос не удался
    } finally {
      // Всегда очищаем локальное состояние
      authAPI.clearTokens();
      setUser(null);
      cacheUser(null);
    }
  };

  const refetchUser = async () => {
    setIsLoading(true);
    await fetchCurrentUser();
    setIsLoading(false);
  };

  // Принудительная синхронизация состояния с сервером
  const syncAuthState = async () => {
    setIsLoading(true);
    try {
      // Проверяем локальное состояние токена или восстанавливаем из refresh cookie
      if (!authAPI.isAuthenticated()) {
        // Попытка восстановить сессию через refresh token
        const refreshSuccess = await authAPI.forceRefreshToken();
        if (!refreshSuccess) {
          // Не очищаем - оставляем offline-first
          return;
        }
      }

      // Получаем актуальные данные пользователя
      await fetchCurrentUser();
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error('Auth sync failed:', error);
      }
      // Очищаем только при 401/403
      const err = error as { response?: { status?: number } };
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        authAPI.clearTokens();
        setUser(null);
        cacheUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Фоновая валидация токена при монтировании
    // Не блокируем UI - пользователь из кэша уже загружен
    // Не очищаем при ошибках - fetchCurrentUser сам решает когда чистить
    fetchCurrentUser();

    // Периодическая проверка состояния токена (каждые 5 минут)
    const interval = setInterval(() => {
      if (user) {
        // Тихо пытаемся обновить, не очищаем при ошибках
        fetchCurrentUser();
      }
    }, 5 * 60 * 1000);

    // Слушаем событие обновления токена для автоматического обновления пользователя
    const handleTokenRefresh = () => {
      if (user) {
        fetchCurrentUser().catch((error) => {
          if (import.meta.env.DEV) {
            console.error('Failed to update user after token refresh:', error);
          }
        });
      }
    };

    globalThis.addEventListener('token-refreshed', handleTokenRefresh);

    // Обработчик изменения статуса аккаунта
    const handleAccountStatusChanged = () => {
      if (import.meta.env.DEV) {
        console.warn('Account status changed, refreshing user data...');
      }
      fetchCurrentUser().catch((error) => {
        if (import.meta.env.DEV) {
          console.error('Failed to update user after status change:', error);
        }
      });
    };

    globalThis.addEventListener('account-status-changed', handleAccountStatusChanged);

    return () => {
      clearInterval(interval);
      globalThis.removeEventListener('token-refreshed', handleTokenRefresh);
      globalThis.removeEventListener('account-status-changed', handleAccountStatusChanged);
    };
  }, [user]);

  const contextValue = useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refetchUser,
    syncAuthState,
  }), [user, isAuthenticated, isLoading]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
