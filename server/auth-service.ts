import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { emailService } from "./services/email-service";

export type SessionType = 'normal' | 'remember_me';

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  status?: string;
  sessionType?: SessionType;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: Omit<User, 'password'>;
  tokens: AuthTokens;
  sessionType: SessionType;
}

export class AuthService {
  private readonly JWT_SECRET: string;
  private readonly JWT_REFRESH_SECRET: string;
  private readonly ACCESS_TOKEN_SHORT = '15m';     // Обычная сессия
  private readonly ACCESS_TOKEN_LONG = '2h';       // Длительная сессия (Remember Me)
  private readonly REFRESH_TOKEN_SHORT = '7d';     // Обычная сессия
  private readonly REFRESH_TOKEN_LONG = '30d';     // Remember Me сессия
  private readonly EMAIL_CONFIRMATION_EXPIRY = '24h'; // Срок действия токена подтверждения

  constructor() {
    this.JWT_SECRET = this.getRequiredEnvVar('JWT_SECRET');
    this.JWT_REFRESH_SECRET = this.getRequiredEnvVar('JWT_REFRESH_SECRET');
  }

  private getRequiredEnvVar(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`CRITICAL: ${name} environment variable is required for production`);
    }
    return value;
  }

  /**
   * Генерирует access и refresh токены для пользователя
   */
  async generateTokens(user: User, rememberMe: boolean = false): Promise<AuthTokens> {
    const sessionType: SessionType = rememberMe ? 'remember_me' : 'normal';
    const accessExpiry = rememberMe ? this.ACCESS_TOKEN_LONG : this.ACCESS_TOKEN_SHORT;
    
    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      sessionType,
    };

    const accessToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: accessExpiry,
    });

    const refreshTokenValue = randomBytes(32).toString('hex');
    const refreshTokenExpiry = new Date();
    
    // Устанавливаем срок действия в зависимости от типа сессии
    if (rememberMe) {
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 30); // 30 дней
    } else {
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 дней
    }

    // Сохраняем refresh token в БД
    await storage.createRefreshToken(user.id, refreshTokenValue, refreshTokenExpiry);

    return {
      accessToken,
      refreshToken: refreshTokenValue,
    };
  }

  /**
   * Верифицирует access token
   */
  verifyAccessToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as JWTPayload;
      return decoded;
    } catch (error) {
      console.error('Failed to verify access token:', error);
      return null;
    }
  }

  /**
   * Обновляет токены по refresh token
   */
  async refreshTokens(refreshToken: string): Promise<{ newTokens: AuthTokens; sessionType: SessionType } | null> {
    try {
      // Проверяем refresh token в БД
      const tokenRecord = await storage.getRefreshToken(refreshToken);
      
      if (!tokenRecord || tokenRecord.isRevoked || tokenRecord.expiresAt < new Date()) {
        return null;
      }

      // Получаем пользователя
      const user = await storage.getUser(tokenRecord.userId);
      if (!user) {
        return null;
      }

      // Определяем тип сессии по сроку действия токена
      const now = new Date();
      const daysLeft = Math.ceil((tokenRecord.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const sessionType: SessionType = daysLeft > 14 ? 'remember_me' : 'normal';

      // Отзываем старый refresh token
      await storage.revokeRefreshToken(refreshToken);

      // Генерируем новые токены с тем же типом сессии
      const rememberMe = sessionType === 'remember_me';
      const newTokens = await this.generateTokens(user, rememberMe);

      // Обновляем время последней активности
      await storage.updateUserLastActivity(user.id);

      return { newTokens, sessionType };
    } catch (error) {
      console.error('Error refreshing tokens:', error);
      return null;
    }
  }

  /**
   * Аутентификация пользователя по email или username
   */
  async authenticate(emailOrUsername: string, password: string, rememberMe: boolean = false): Promise<AuthResult | null> {
    try {
      // Пытаемся найти пользователя по email или username
      let user = await storage.getUserByEmail(emailOrUsername);
      user ??= await storage.getUserByUsername(emailOrUsername);
      
      if (!user) {
        return null;
      }

      // Проверяем пароль
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return null;
      }

      // Проверяем статус пользователя
      if (user.status === 'suspended') {
        throw new Error('ACCOUNT_SUSPENDED');
      }
      
      if (user.status === 'deleted') {
        throw new Error('ACCOUNT_DELETED');
      }

      // Проверяем подтверждение email - требуется для всех пользователей
      if (!user.emailConfirmed) {
        throw new Error('EMAIL_NOT_CONFIRMED');
      }

      // Генерируем токены (в том числе для pending пользователей)
      const tokens = await this.generateTokens(user, rememberMe);
      const sessionType: SessionType = rememberMe ? 'remember_me' : 'normal';

      // Обновляем время последней активности
      await storage.updateUserLastActivity(user.id);

      // Возвращаем пользователя без пароля
      const { password: _, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        tokens,
        sessionType,
      };
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  /**
   * Регистрация нового пользователя
   */
  async register(
    username: string, 
    email: string, 
    password: string, 
    invitedBy?: string,
    invitedToClub?: string,
    rememberMe: boolean = false
  ): Promise<AuthResult> {
    try {
      // Проверяем, существует ли пользователь с таким username
      const existingUserByUsername = await storage.getUserByUsername(username);
      if (existingUserByUsername) {
        throw new Error('Пользователь с таким именем уже существует');
      }

      // Проверяем, существует ли пользователь с таким email
      const existingUserByEmail = await storage.getUserByEmail(email);
      if (existingUserByEmail) {
        throw new Error('Пользователь с таким email уже существует');
      }

      // Хэшируем пароль
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Генерируем токен подтверждения email
      const confirmationToken = randomBytes(32).toString('hex');

      // Создаем пользователя
      const newUser = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        invitedBy: invitedBy || null,
        invitedToClub: invitedToClub || null,
        confirmationToken, // сохраняем токен подтверждения
        status: 'pending', // все пользователи начинают как pending
        emailConfirmed: false,
      } as any);

      // Отправляем email подтверждения
      try {
        await this.sendConfirmationEmail(newUser, confirmationToken);
        console.log(`Confirmation email sent to ${email}`);
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
        // Не блокируем регистрацию если email не отправился
      }

      // Генерируем токены
      const tokens = await this.generateTokens(newUser, rememberMe);
      const sessionType: SessionType = rememberMe ? 'remember_me' : 'normal';

      // Возвращаем пользователя без пароля
      const { password: _, ...userWithoutPassword } = newUser;

      return {
        user: userWithoutPassword,
        tokens,
        sessionType,
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  /**
   * Выход из системы (отзыв refresh token)
   */
  async logout(refreshToken: string): Promise<boolean> {
    try {
      return await storage.revokeRefreshToken(refreshToken);
    } catch (error) {
      console.error('Logout error:', error);
      return false;
    }
  }

  /**
   * Выход из всех устройств (отзыв всех refresh токенов пользователя)
   */
  async logoutAll(userId: string): Promise<boolean> {
    try {
      return await storage.revokeAllUserRefreshTokens(userId);
    } catch (error) {
      console.error('Logout all error:', error);
      return false;
    }
  }

  /**
   * Очистка истекших refresh токенов (для периодического запуска)
   */
  async cleanupExpiredTokens(): Promise<void> {
    try {
      await storage.cleanExpiredRefreshTokens();
    } catch (error) {
      console.error('Cleanup expired tokens error:', error);
    }
  }

  /**
   * Извлекает токен из заголовка Authorization
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Извлекает refresh token из cookies
   */
  extractRefreshTokenFromCookies(cookies: any): string | null {
    return cookies?.refreshToken || null;
  }

  /**
   * Получает текущего пользователя по JWT токену
   */
  async getCurrentUser(token: string): Promise<Omit<User, 'password'> | null> {
    try {
      const payload = this.verifyAccessToken(token);
      if (!payload) {
        return null;
      }

      const user = await storage.getUser(payload.userId);
      if (!user) {
        return null;
      }

      // Проверяем статус пользователя
      if (user.status !== 'active') {
        return null;
      }

      // Возвращаем пользователя без пароля
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }

  /**
   * Проверяет валидность токена без выброса исключений
   */
  isTokenValid(token: string): boolean {
    try {
      const payload = this.verifyAccessToken(token);
      return payload !== null;
    } catch {
      return false;
    }
  }

  /**
   * Отправляет email подтверждения
   */
  private async sendConfirmationEmail(user: User, confirmationToken: string): Promise<void> {
    try {
      await emailService.sendRegistrationConfirmation({
        email: user.email,
        username: user.username,
        confirmationToken,
      });
    } catch (error) {
      console.error('Failed to send confirmation email:', error);
      throw error;
    }
  }

/**
 * Подтверждает email пользователя по токену
 */
async confirmEmail(token: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = await storage.getUserByConfirmationToken(token);
    if (!user) {
      return { success: false, message: 'Недействительный токен подтверждения' };
    }

    if (user.emailConfirmed) {
      return { success: true, message: 'Email уже подтвержден' };
    }

    // Обновляем статус пользователя
    await storage.updateUserEmailConfirmation(user.id, true);
    await storage.updateUserStatus(user.username, 'active');
      
    console.log(`Email confirmed for user ${user.username} (${user.email})`);
    return { success: true, message: 'Email успешно подтвержден. Теперь вы можете использовать все функции VoxLibris.' };
  } catch (error) {
    console.error('Email confirmation error:', error);
    return { success: false, message: 'Ошибка при подтверждении email' };
  }
}

/**
 * Отправляет повторное письмо подтверждения
 */
async resendConfirmationEmail(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = await storage.getUser(userId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден' };
    }

    if (user.emailConfirmed) {
      return { success: false, message: 'Email уже подтвержден' };
    }

    // Генерируем новый токен
    const newToken = randomBytes(32).toString('hex');
    await storage.updateUserConfirmationToken(user.id, newToken);

    // Отправляем email
    await this.sendConfirmationEmail(user, newToken);
      
    return { success: true, message: 'Письмо с подтверждением отправлено повторно' };
  } catch (error) {
    console.error('Resend confirmation email error:', error);
    return { success: false, message: 'Ошибка при отправке повторного письма' };
  }
}
}

// Экспортируем singleton instance
export const authService = new AuthService();