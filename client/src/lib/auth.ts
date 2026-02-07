import { User } from '../../../shared/schema';
import { getAccessToken, setAccessToken, isTokenExpired } from './token-store';
import { apiRequest } from './queryClient';

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
  accessToken?: string;
}

interface RefreshResponse {
  accessToken: string;
}

class AuthAPI {
  private readonly baseURL = '/api';
  private refreshTimer: NodeJS.Timeout | null = null;
  private activityTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();

  // Запуск автоматического обновления токенов
  private startTokenRefreshTimer(): void {
    this.clearTokenRefreshTimer();
    
    const token = getAccessToken();
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
            // apiRequest автоматически обновит токен
            await apiRequest('/api/auth/refresh', { method: 'POST' });
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
      if (!this.refreshTimer && getAccessToken()) {
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
    globalThis.dispatchEvent(new CustomEvent('auth-error'));
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    try {
      const result = await apiRequest<AuthResponse>(`${this.baseURL}/auth/register`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      
      // Сохраняем access token из ответа
      if (result.accessToken) {
        setAccessToken(result.accessToken);
        
        // Запускаем автоматическое обновление токенов
        this.startTokenRefreshTimer();
        
        // Запускаем отслеживание активности
        this.startActivityTracking();
      }

      return result;
    } catch (error) {
      // Очищаем состояние при ошибке
      setAccessToken(null);
      throw error;
    }
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    try {
      const result = await apiRequest<AuthResponse>(`${this.baseURL}/auth/login`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      
      // Сохраняем access token из ответа
      if (result.accessToken) {
        setAccessToken(result.accessToken);
        
        // Запускаем автоматическое обновление токенов
        this.startTokenRefreshTimer();
        
        // Запускаем отслеживание активности
        this.startActivityTracking();
      }

      return result;
    } catch (error) {
      // Очищаем состояние при ошибке
      setAccessToken(null);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await apiRequest(`${this.baseURL}/auth/logout`, {
        method: 'POST',
      });
    } catch (error) {
      // Игнорируем ошибки logout на сервере
      console.error('Logout error:', error);
    } finally {
      // Всегда очищаем локальное состояние
      this.clearTokens();
    }
  }

  async getCurrentUser(): Promise<AuthResponse> {
    return await apiRequest<AuthResponse>(`${this.baseURL}/auth/me`, {
      method: 'GET',
    });
  }

  // Очистить токены (для выхода)
  clearTokens(): void {
    setAccessToken(null);
    this.clearTokenRefreshTimer();
    this.stopActivityTracking();
  }

  // Проверить, аутентифицирован ли пользователь
  isAuthenticated(): boolean {
    const token = getAccessToken();
    return token !== null && !isTokenExpired(token);
  }

  // Получить данные пользователя из токена (без запроса к серверу)
  getUserFromToken(): { userId: string; username: string; role: string } | null {
    const token = getAccessToken();
    if (!token || isTokenExpired(token)) {
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
      const result = await apiRequest<RefreshResponse>('/api/auth/refresh', {
        method: 'POST',
      });
      
      if (result.accessToken) {
        setAccessToken(result.accessToken);
        this.startTokenRefreshTimer();
        return true;
      }
      
      return false;
    } catch {
      setAccessToken(null);
      return false;
    }
  }
}

export const authAPI = new AuthAPI();