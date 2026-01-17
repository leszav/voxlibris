import { User } from '../../../shared/schema';
import { AuthError, AuthErrorFactory, AuthErrorHandler } from './auth-errors';

interface LoginRequest {
  username: string;
  password: string;
  rememberMe?: boolean;
}

interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  rememberMe?: boolean;
  invitedBy?: string;
  invitedToClub?: string;
  invite?: string; // invite token
}

interface AuthResponse {
  user: User;
}

interface RefreshResponse {
  accessToken: string;
}

class AuthAPI {
  private readonly baseURL = '/api';
  private refreshTimer: NodeJS.Timeout | null = null;
  private activityTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private isRefreshing: boolean = false;

  // Получить токен только из localStorage (единый источник правды)
  private getAccessToken(): string | null {
    try {
      return localStorage.getItem('accessToken');
    } catch {
      return null;
    }
  }

  // Сохранить токен только в localStorage
  private setAccessToken(token: string | null): void {
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

  // Проверить валидность токена
  private isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch {
      return true;
    }
  }

  // Создать заголовки с авторизацией
  private createHeaders(includeAuth: boolean = true): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (includeAuth) {
      const token = this.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  // Обновить access token через refresh token
  private async refreshAccessToken(): Promise<string> {
    // Защита от одновременных запросов на обновление
    if (this.isRefreshing) {
      // Ждем завершения текущего обновления
      return new Promise((resolve, reject) => {
        const checkRefresh = () => {
          const token = this.getAccessToken();
          if (this.isRefreshing) {
            setTimeout(checkRefresh, 100);
          } else if (token) {
            resolve(token);
          } else {
            reject(new Error('Refresh failed'));
          }
        };
        checkRefresh();
      });
    }

    this.isRefreshing = true;
    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // Для отправки httpOnly refresh cookie
      });

      if (!response.ok) {
        const responseText = await response.text();
        const error = AuthErrorFactory.fromResponse(response, responseText);
        AuthErrorHandler.logError(error, 'refreshAccessToken');
        throw error;
      }

      const data: RefreshResponse = await response.json();
      this.setAccessToken(data.accessToken);
      
      // Перезапускаем таймер автоматического обновления
      this.startTokenRefreshTimer();
      
      return data.accessToken;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      
      const authError = AuthErrorFactory.refreshFailed();
      AuthErrorHandler.logError(authError, 'refreshAccessToken');
      throw authError;
    } finally {
      this.isRefreshing = false;
    }
  }

  // Запуск автоматического обновления токенов
  private startTokenRefreshTimer(): void {
    this.clearTokenRefreshTimer();
    
    const token = this.getAccessToken();
    if (!token) return;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresIn = (payload.exp * 1000) - Date.now();
      
      // Обновляем токен за 2 минуты до истечения
      const refreshTime = Math.max(expiresIn - 2 * 60 * 1000, 30 * 1000);
      
      this.refreshTimer = setTimeout(async () => {
        try {
          // Проверяем активность пользователя
          const inactiveTime = Date.now() - this.lastActivity;
          const INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 минут
          
          if (inactiveTime < INACTIVE_THRESHOLD) {
            await this.refreshAccessToken();
          } else {
            // Пользователь неактивен - не обновляем автоматически
            this.clearTokenRefreshTimer();
          }
        } catch (error) {
          console.error('Auto refresh failed:', error);
          this.handleAuthError();
        }
      }, refreshTime);
    } catch (error) {
      console.error('Failed to parse token for refresh timer:', error);
    }
  }

  // Очистить таймер обновления
  private clearTokenRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // Отслеживание активности пользователя
  private startActivityTracking(): void {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const updateActivity = () => {
      this.lastActivity = Date.now();
      
      // Возобновляем обновление токенов, если пользователь снова активен
      if (!this.refreshTimer && this.getAccessToken()) {
        this.startTokenRefreshTimer();
      }
    };
    
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });
    
    // Проверяем активность каждые 5 минут
    this.activityTimer = setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivity;
      const INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 минут
      
      if (inactiveTime > INACTIVE_THRESHOLD) {
        // Пользователь неактивен - приостанавливаем обновление
        this.clearTokenRefreshTimer();
      }
    }, 5 * 60 * 1000);
  }

  // Остановить отслеживание активности
  private stopActivityTracking(): void {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  // Обработка ошибок аутентификации
  private handleAuthError(): void {
    this.clearTokens();
    this.clearTokenRefreshTimer();
    // Можно добавить редирект на страницу логина или показать уведомление
    globalThis.dispatchEvent(new CustomEvent('auth-error'));
  }

  // Выполнить запрос с автоматическим обновлением токена
  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getAccessToken();
    
    // Проверяем, не истек ли токен перед запросом
    if (token && this.isTokenExpired(token)) {
      try {
        await this.refreshAccessToken();
      } catch {
        // Если обновление не удалось, очищаем токен
        this.setAccessToken(null);
        throw new Error('Сессия истекла. Необходимо войти в систему заново.');
      }
    }
    
    // Выполняем запрос с актуальным токеном
    let response = await fetch(url, {
      ...options,
      headers: {
        ...this.createHeaders(),
        ...options.headers,
      },
      credentials: 'include',
    });

    // Если получили 401, пробуем обновить токен один раз
    if (response.status === 401) {
      try {
        await this.refreshAccessToken();
        
        // Повторяем запрос с новым токеном
        response = await fetch(url, {
          ...options,
          headers: {
            ...this.createHeaders(),
            ...options.headers,
          },
          credentials: 'include',
        });
      } catch {
        // Если обновление не удалось, очищаем токен и выбрасываем ошибку
        this.setAccessToken(null);
        throw new Error('Сессия истекла. Необходимо войти в систему заново.');
      }
    }

    return response;
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseURL}/auth/register`, {
        method: 'POST',
        headers: this.createHeaders(false),
        body: JSON.stringify(data),
        credentials: 'include',
      });

      if (!response.ok) {
        const responseText = await response.text();
        const error = AuthErrorFactory.fromResponse(response, responseText);
        AuthErrorHandler.logError(error, 'register');
        throw error;
      }

      const result = await response.json();
      
      // Сохраняем access token из ответа
      if (result.accessToken) {
        this.setAccessToken(result.accessToken);
        
        // Запускаем автоматическое обновление токенов
        this.startTokenRefreshTimer();
        
        // Запускаем отслеживание активности
        this.startActivityTracking();
      }

      return result;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = AuthErrorFactory.fromNetworkError(error);
        AuthErrorHandler.logError(networkError, 'register');
        throw networkError;
      }
      
      throw error;
    }
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseURL}/auth/login`, {
        method: 'POST',
        headers: this.createHeaders(false),
        body: JSON.stringify(data),
        credentials: 'include',
      });

      if (!response.ok) {
        const responseText = await response.text();
        const error = AuthErrorFactory.fromResponse(response, responseText);
        AuthErrorHandler.logError(error, 'login');
        throw error;
      }

      const result = await response.json();
      
      // Сохраняем access token из ответа
      if (result.accessToken) {
        this.setAccessToken(result.accessToken);
        
        // Запускаем автоматическое обновление токенов
        this.startTokenRefreshTimer();
        
        // Запускаем отслеживание активности
        this.startActivityTracking();
      }

      return result;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = AuthErrorFactory.fromNetworkError(error);
        AuthErrorHandler.logError(networkError, 'login');
        throw networkError;
      }
      
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      const response = await this.fetchWithAuth(`${this.baseURL}/auth/logout`, {
        method: 'POST',
      });

      if (!response.ok) {
        const responseText = await response.text();
        const error = AuthErrorFactory.fromResponse(response, responseText);
        AuthErrorHandler.logError(error, 'logout');
        
        // Очищаем токен даже при ошибке logout
        this.setAccessToken(null);
        this.clearTokenRefreshTimer();
        this.stopActivityTracking();
        throw error;
      }
    } catch (error) {
      // Всегда очищаем токен и таймеры при logout
      this.setAccessToken(null);
      this.clearTokenRefreshTimer();
      this.stopActivityTracking();
      
      if (error instanceof AuthError) {
        throw error;
      }
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = AuthErrorFactory.fromNetworkError(error);
        AuthErrorHandler.logError(networkError, 'logout');
        throw networkError;
      }
      
      throw error;
    }
  }

  async getCurrentUser(): Promise<AuthResponse> {
    try {
      const response = await this.fetchWithAuth(`${this.baseURL}/auth/me`, {
        method: 'GET',
      });

      if (!response.ok) {
        const responseText = await response.text();
        const error = AuthErrorFactory.fromResponse(response, responseText);
        AuthErrorHandler.logError(error, 'getCurrentUser');
        throw error;
      }

      return response.json();
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      
      throw error;
    }
  }

  // Очистить токены (для выхода)
  clearTokens(): void {
    this.setAccessToken(null);
    this.clearTokenRefreshTimer();
    this.stopActivityTracking();
  }

  // Проверить, аутентифицирован ли пользователь
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    return token !== null && !this.isTokenExpired(token);
  }

  // Получить данные пользователя из токена (без запроса к серверу)
  getUserFromToken(): { userId: string; username: string; role: string } | null {
    const token = this.getAccessToken();
    if (!token || this.isTokenExpired(token)) {
      return null;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        userId: payload.userId,
        username: payload.username,
        role: payload.role
      };
    } catch {
      return null;
    }
  }

  // Принудительное обновление токена
  async forceRefreshToken(): Promise<boolean> {
    try {
      await this.refreshAccessToken();
      return true;
    } catch {
      this.setAccessToken(null);
      return false;
    }
  }
}

export const authAPI = new AuthAPI();