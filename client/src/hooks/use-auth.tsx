import React, { createContext, useCallback, useContext, useEffect, useState, useMemo, useRef, ReactNode } from 'react';
import { authAPI, type AuthUserClient } from '@/lib/auth';
import { syncTokenFromCookie } from '@/lib/token-store';

interface AuthContextType {
  user: AuthUserClient | null;
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
  // Безопасное состояние без кэширования в localStorage
  const [user, setUser] = useState<AuthUserClient | null>(null);
 const [isLoading, setIsLoading] = useState(true);
  const isInitializedRef = useRef(false);
  const hasExplicitLogoutRef = useRef(false);
  const isFetchingRef = useRef(false); // Debounce для fetchCurrentUser

  const isAuthenticated = !!user;

  // Безопасное управление состоянием без localStorage
  const cacheUser = () => {
    // Убрано кэширование в localStorage по соображениям безопасности
    // httpOnly cookies обеспечивают безопасность, localStorage создает XSS уязвимости
  };

  const fetchCurrentUser = useCallback(async () => {
    // Debounce: предотвращаем одновременные вызовы
    if (isFetchingRef.current) {
      return;
    }
    
    // После явного logout не пытаемся автоматически реанимировать сессию.
    if (hasExplicitLogoutRef.current) {
      return;
    }

    isFetchingRef.current = true;
    try {
      // Запрашиваем данные пользователя с сервера
      // apiRequest автоматически обновит истекший токен при необходимости
      // Токен автоматически передается через cookie и Authorization header
      const response = await authAPI.getCurrentUser();
      setUser(response.user);
      cacheUser();
      hasExplicitLogoutRef.current = false;
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch current user:', error);
      }
      
      // Проверяем тип ошибки для корректной обработки
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Очищаем состояние при ошибках авторизации
      if (errorMessage.includes('401') || errorMessage.includes('403') || 
          errorMessage.includes('Требуется авторизация') || 
          errorMessage.includes('Недействительный токен') ||
          errorMessage.includes('Необходимо подтвердить email') ||
          errorMessage.includes('Подтвердите email')) {
        authAPI.clearTokens();
        setUser(null);
        cacheUser();
      }
      // При других ошибках (сеть, таймаут) - оставляем кэшированного user
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  const login = useCallback(async (username: string, password: string, rememberMe: boolean = false) => {
    try {
      const response = await authAPI.login({ username, password, rememberMe });
      setUser(response.user);
      cacheUser();
      hasExplicitLogoutRef.current = false;
    } catch (error) {
      // Очищаем состояние при неудачном входе
      authAPI.clearTokens();
      setUser(null);
      cacheUser();
      throw error;
    }
  }, []);

  const register = useCallback(async (username: string, email: string, password: string, rememberMe: boolean = false, inviteToken?: string) => {
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
      cacheUser();
      hasExplicitLogoutRef.current = false;

      if (response.user.status === 'pending' || !response.user.emailConfirmed) {
        globalThis.dispatchEvent(new CustomEvent('email-verification-required'));
      }
    } catch (error) {
      // Очищаем состояние при неудачной регистрации
      authAPI.clearTokens();
      setUser(null);
      cacheUser();
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    // Оптимистичный logout: очищаем клиентское состояние сразу,
    // а серверный revoke запускаем в фоне.
    hasExplicitLogoutRef.current = true;
    authAPI.clearTokens();
    setUser(null);
    cacheUser();

    void authAPI.logout().catch((error) => {
      if (import.meta.env.DEV) {
        console.error('Logout request failed:', error);
      }
    });
  }, []);

  const refetchUser = useCallback(async () => {
    setIsLoading(true);
    await fetchCurrentUser();
    setIsLoading(false);
  }, [fetchCurrentUser]);

  // Принудительная синхронизация состояния с сервером
  const syncAuthState = useCallback(async () => {
    setIsLoading(true);
    try {
      if (hasExplicitLogoutRef.current) {
        return;
      }

      // Просто запрашиваем данные пользователя
      // httpOnly cookie автоматически передается с запросом
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
        cacheUser();
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchCurrentUser]);

  useEffect(() => {
    let isMounted = true;
    let bootstrapTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let bootstrapIdleId: number | null = null;

    const logBootstrapError = (error: unknown) => {
      if (import.meta.env.DEV) {
        console.error('Deferred auth bootstrap failed:', error);
      }
    };

    const scheduleBackgroundAuthBootstrap = () => {
      const run = () => {
        if (!isMounted || hasExplicitLogoutRef.current) return;
        fetchCurrentUser().catch(logBootstrapError);
      };

      const idleCallback = globalThis.window?.requestIdleCallback ?? null;

      if (idleCallback) {
        bootstrapIdleId = idleCallback(() => { run(); }, { timeout: 2500 });
        return;
      }

      bootstrapTimeoutId = setTimeout(run, 2000);
    };

    const initializeAuthState = async () => {
      // Синхронизируем токен из cookie при инициализации
      syncTokenFromCookie();
      
      if (!isInitializedRef.current) {
        setIsLoading(true);
      }

      if (authAPI.isAuthenticated()) {
        await fetchCurrentUser();

        if (isMounted && !isInitializedRef.current) {
          isInitializedRef.current = true;
          setIsLoading(false);
        }
        return;
      }

      if (isMounted && !isInitializedRef.current) {
        isInitializedRef.current = true;
        setIsLoading(false);
      }

      scheduleBackgroundAuthBootstrap();
    };

    void initializeAuthState();

    // Периодическая проверка состояния токена (каждые 15 минут)
    // Оптимизировано для снижения нагрузки на сервер
    const interval = setInterval(() => {
      // Проверяем наличие токена вместо user state чтобы избежать stale closure
      if (authAPI.isAuthenticated()) {
        // Тихо пытаемся обновить, не очищаем при ошибках
        fetchCurrentUser();
      }
    }, 15 * 60 * 1000);

    // Слушаем событие обновления токена для автоматического обновления пользователя
    const handleTokenRefresh = () => {
      // Убираем проверку user чтобы избежать stale closure
      fetchCurrentUser().catch((error) => {
        if (import.meta.env.DEV) {
          console.error('Failed to update user after token refresh:', error);
        }
      });
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
      isMounted = false;
      clearInterval(interval);
      if (bootstrapTimeoutId) {
        clearTimeout(bootstrapTimeoutId);
      }
      if (bootstrapIdleId !== null && globalThis.window?.cancelIdleCallback) {
        globalThis.window.cancelIdleCallback(bootstrapIdleId);
      }
      globalThis.removeEventListener('token-refreshed', handleTokenRefresh);
      globalThis.removeEventListener('account-status-changed', handleAccountStatusChanged);
    };
  }, []); // Убираем user из зависимостей чтобы избежать бесконечного цикла

  const contextValue = useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refetchUser,
    syncAuthState,
  }), [user, isAuthenticated, isLoading, login, logout, register, refetchUser, syncAuthState]);

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
