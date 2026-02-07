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

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  const fetchCurrentUser = async () => {
    try {
      // При первой загрузке accessToken может отсутствовать в памяти,
      // но refreshToken есть в httpOnly cookie. Пробуем восстановить сессию.
      if (!authAPI.isAuthenticated()) {
        // Попытка восстановить сессию через refresh token в cookie
        const refreshSuccess = await authAPI.forceRefreshToken();
        if (!refreshSuccess) {
          setUser(null);
          return;
        }
      }

      // Получаем актуальные данные пользователя с сервера
      const response = await authAPI.getCurrentUser();
      setUser(response.user);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch current user:', error);
      }
      // Очищаем состояние при ошибке
      authAPI.clearTokens();
      setUser(null);
    }
  };

  const login = async (username: string, password: string, rememberMe: boolean = false) => {
    try {
      const response = await authAPI.login({ username, password, rememberMe });
      setUser(response.user);
    } catch (error) {
      // Очищаем состояние при неудачном входе
      authAPI.clearTokens();
      setUser(null);
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string, rememberMe: boolean = false, inviteToken?: string) => {
    try {
      const payload: any = { username, email, password, rememberMe };
      if (inviteToken) payload.invite = inviteToken;
      const response = await authAPI.register(payload);
      setUser(response.user);
    } catch (error) {
      // Очищаем состояние при неудачной регистрации
      authAPI.clearTokens();
      setUser(null);
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
          setUser(null);
          return;
        }
      }

      // Получаем актуальные данные пользователя
      await fetchCurrentUser();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Auth sync failed:', error);
      }
      authAPI.clearTokens();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Инициализация при монтировании
    refetchUser();

    // Периодическая проверка состояния токена (каждые 5 минут)
    const interval = setInterval(() => {
      if (authAPI.isAuthenticated()) {
        fetchCurrentUser().catch(() => {
          // Если проверка не удалась, очищаем состояние
          authAPI.clearTokens();
          setUser(null);
        });
      }
    }, 5 * 60 * 1000);

    // Слушаем событие обновления токена для автоматического обновления пользователя
    const handleTokenRefresh = () => {
      if (authAPI.isAuthenticated()) {
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
        console.log('Account status changed, refreshing user data...');
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
  }, []);

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