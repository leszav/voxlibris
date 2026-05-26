import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { randomBytes, createHash } from "node:crypto";
import { storage } from "./repositories/index.js";
import type { User, UserRole, UserStatus, InsertUser } from "../shared/schema.js";
import { emailService } from "./services/email-service.js";
import { logger } from "./lib/logger.js";
import { generateUsernameFromDisplayName } from "./lib/username-generator.js";

export type SessionType = 'normal' | 'remember_me';

// Строгая типизация для БД результатов с паролем
interface DatabaseUser {
  id: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  emailConfirmed: boolean;
  confirmationToken?: string | null;
  invitedBy?: string | null;
  invitedToClub?: string | null;
  lastActivityAt?: Date | null;
  suspensionReason?: string | null;
  suspendedUntil?: Date | null;
  failedLoginAttempts?: number;
  createdAt: Date;
}

// Type guard для безопасной валидации БД результатов
function isDatabaseUser(obj: unknown): obj is DatabaseUser {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const user = obj as Record<string, unknown>;
  return (
    typeof user.id === 'string' &&
    typeof user.username === 'string' &&
    typeof user.email === 'string' &&
    typeof user.password === 'string' &&
    typeof user.role === 'string' &&
    typeof user.status === 'string' &&
    typeof user.emailConfirmed === 'boolean' &&
    user.createdAt instanceof Date
  );
}

// Безопасное преобразование DatabaseUser в публичный User
function toSafeUser(dbUser: DatabaseUser): Omit<User, 'password'> {
  return {
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    role: dbUser.role,
    status: dbUser.status,
    emailConfirmed: dbUser.emailConfirmed,
    confirmationToken: dbUser.confirmationToken ?? null,
    invitedBy: dbUser.invitedBy ?? null,
    invitedToClub: dbUser.invitedToClub ?? null,
    lastActivityAt: dbUser.lastActivityAt ?? null,
    suspensionReason: dbUser.suspensionReason ?? null,
    suspendedUntil: dbUser.suspendedUntil ?? null,
    failedLoginAttempts: dbUser.failedLoginAttempts ?? 0,
    createdAt: dbUser.createdAt,
  };
}

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
  private _jwtSecret?: string;
  private _jwtRefreshSecret?: string;
  private readonly ACCESS_TOKEN_SHORT = '15m';     // Обычная сессия
  private readonly ACCESS_TOKEN_LONG = '2h';       // Длительная сессия (Remember Me)
  private readonly REFRESH_TOKEN_SHORT = '7d';     // Обычная сессия
  private readonly REFRESH_TOKEN_LONG = '30d';     // Remember Me сессия
  private readonly EMAIL_CONFIRMATION_EXPIRY = '24h'; // Срок действия токена подтверждения
  private readonly PASSWORD_RESET_EXPIRY_MINUTES = 60;
  
  // Защита от одновременных refresh операций
  private readonly activeRefreshOperations = new Map<string, Promise<{ newTokens: AuthTokens; sessionType: SessionType } | null>>();

  private get JWT_SECRET(): string {
    if (!this._jwtSecret) {
      this._jwtSecret = this.getRequiredEnvVar('JWT_SECRET');
    }
    return this._jwtSecret;
  }

  private get JWT_REFRESH_SECRET(): string {
    if (!this._jwtRefreshSecret) {
      this._jwtRefreshSecret = this.getRequiredEnvVar('JWT_REFRESH_SECRET');
    }
    return this._jwtRefreshSecret;
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
  async generateTokens(
    user: Pick<User, "id" | "username" | "role" | "status">,
    rememberMe: boolean = false
  ): Promise<AuthTokens> {
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
      // Тихо логируем ошибки верификации токена
      if (error instanceof Error) {
        logger.debug(`Token verification failed: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Обновляет токены по refresh token
   * Защищено от одновременных операций для одного пользователя
   */
  async refreshTokens(refreshToken: string): Promise<{ newTokens: AuthTokens; sessionType: SessionType } | null> {
    try {
      // Проверяем refresh token в БД
      const tokenRecord = await storage.getRefreshToken(refreshToken);
      
      if (!tokenRecord || tokenRecord.isRevoked || tokenRecord.expiresAt < new Date()) {
        return null;
      }

      const userId = tokenRecord.userId;
      
      // Проверяем, есть ли уже активная refresh операция для этого пользователя
      const existingOperation = this.activeRefreshOperations.get(userId);
      if (existingOperation) {
        // Ждем завершения существующей операции
        return await existingOperation;
      }

      // Создаем новую refresh операцию
      const refreshOperation = this.performRefreshOperation(refreshToken, tokenRecord, userId);
      this.activeRefreshOperations.set(userId, refreshOperation);

      try {
        const result = await refreshOperation;
        return result;
      } finally {
        // Очищаем операцию после завершения
        this.activeRefreshOperations.delete(userId);
      }
    } catch (error) {
      console.error('Error refreshing tokens:', error);
      return null;
    }
  }

  /**
   * Выполняет фактическое обновление токенов
   * ВАЖНО: токен отзывается ПЕРЕД проверкой пользователя для предотвращения race condition
   */
  private async performRefreshOperation(
    refreshToken: string,
    tokenRecord: { expiresAt: Date },
    userId: string
  ): Promise<{ newTokens: AuthTokens; sessionType: SessionType } | null> {
    // ШАГ 1: Сначала отзываем старый токен (ПРЕДОТВРАЩАЕТ race condition)
    // Это гарантирует что только ОДИН запрос может создать новые токены
    await storage.revokeRefreshToken(refreshToken);

    // ШАГ 2: Получаем пользователя после отзыва токена
    // Если пользователь не существует - возвращаем null (токен уже отозван)
    const user = await storage.getUser(userId);
    if (!user) {
      // Токен отозван, пользователь не найден - это состояние ошибки
      return null;
    }

    // ШАГ 3: Проверяем статус пользователя
    // Блокируем обновление токенов для неактивных/неподтвержденных аккаунтов
    // Исключение для админов и модераторов
    if (!['admin', 'moderator'].includes(user.role)) {
      if (user.status !== 'active' || !user.emailConfirmed) {
        // Токен уже отозван, новые токены не создаем
        return null;
      }
    }

    // ШАГ 4: Определяем тип сессии по сроку действия исходного токена
    const now = new Date();
    const daysLeft = Math.ceil((tokenRecord.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const sessionType: SessionType = daysLeft > 14 ? 'remember_me' : 'normal';

    // ШАГ 5: Генерируем новые токены
    const rememberMe = sessionType === 'remember_me';
    const newTokens = await this.generateTokens(user, rememberMe);

    // ШАГ 6: Обновляем время последней активности
    await storage.updateUserLastActivity(user.id);

    return { newTokens, sessionType };
  }

  /**
   * Аутентификация пользователя по email или username
   */
  async authenticate(emailOrUsername: string, password: string, rememberMe: boolean = false): Promise<AuthResult | null> {
    try {
      // Безопасно пытаемся найти пользователя по email или username
      let dbUser: unknown = await storage.getUserByEmail(emailOrUsername);
      if (!dbUser) {
        dbUser = await storage.getUserByUsername(emailOrUsername);
      }
      
      // Строгая валидация типов БД результата
      if (!dbUser || !isDatabaseUser(dbUser)) {
        return null;
      }

      // Проверяем пароль с безопасным доступом к полю
      const isValidPassword = await bcrypt.compare(password, dbUser.password);
      if (!isValidPassword) {
        return null;
      }

      // Проверяем статус пользователя
      if (dbUser.status === 'suspended') {
        throw new Error('ACCOUNT_SUSPENDED');
      }
      
      if (dbUser.status === 'deleted') {
        throw new Error('ACCOUNT_DELETED');
      }

      // Проверяем подтверждение email - требуется для всех пользователей
      if (!dbUser.emailConfirmed) {
        throw new Error('EMAIL_NOT_CONFIRMED');
      }

      // Генерируем токены с безопасным преобразованием типа
      const safeUser = toSafeUser(dbUser);
      const tokens = await this.generateTokens(safeUser, rememberMe);
      const sessionType: SessionType = rememberMe ? 'remember_me' : 'normal';

      // Обновляем время последней активности
      await storage.updateUserLastActivity(dbUser.id);

      return {
        user: safeUser,
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
    displayName: string,
    email: string,
    password: string,
    invitedBy?: string,
    invitedToClub?: string,
    rememberMe: boolean = false,
    baseUrl?: string
  ): Promise<AuthResult> {
    try {
      const normalizedDisplayName = displayName.trim().replace(/\s+/gu, ' ');
      if (normalizedDisplayName.length < 2 || normalizedDisplayName.length > 50) {
        throw new Error('Некорректное имя');
      }

      // Генерируем технический username из displayName
      // (никогда не показываем пользователю; используется как идентификатор)
      let username = generateUsernameFromDisplayName(normalizedDisplayName);

      // Страхуемся от коллизий в БД
      for (let i = 0; i < 5; i++) {
        const existingUserByUsername = await storage.getUserByUsername(username);
        if (!existingUserByUsername) break;
        username = generateUsernameFromDisplayName(normalizedDisplayName);
      }

      const usernameCollision = await storage.getUserByUsername(username);
      if (usernameCollision) {
        throw new Error('Не удалось сгенерировать уникальное имя пользователя');
      }

      // Проверяем, существует ли пользователь с таким email
      const existingUserByEmail = await storage.getUserByEmail(email);
      if (existingUserByEmail) {
        throw new Error('Пользователь с таким email уже существует');
      }

      // Хэшируем пароль (оптимизировано для production)
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Генерируем токен подтверждения email
      const confirmationToken = randomBytes(32).toString('hex');

      // Создаем пользователя с правильной типизацией InsertUser
      const userCreateData: InsertUser = {
        username,
        email,
        password: hashedPassword,
        invitedBy: invitedBy || null,
        invitedToClub: invitedToClub || null,
        status: 'pending', // все пользователи начинают как pending
      };
      
      const dbNewUser = await storage.createUser(userCreateData);
      
      // После создания обновляем токен подтверждения через отдельный метод
      if (dbNewUser && isDatabaseUser(dbNewUser)) {
        await storage.updateUserConfirmationToken(dbNewUser.id, confirmationToken);
        
        // Создаем базовый профиль пользователя
        try {
          await storage.createOrUpdateUserProfile(dbNewUser.id, {
            displayName: normalizedDisplayName,
            isReader: false,
            bio: null,
            avatar: null,
          });
          logger.info({ userId: dbNewUser.id }, 'User profile created');
        } catch (profileError) {
          console.error('Failed to create user profile:', profileError);
          // Не блокируем регистрацию если профиль не создался
        }
      }
      
      // Строгая валидация результата создания пользователя
      if (!dbNewUser || !isDatabaseUser(dbNewUser)) {
        throw new Error('CRITICAL: Ошибка создания пользователя - некорректные данные из БД');
      }

      // Отправляем email подтверждения
      try {
        const safeUserForEmail = toSafeUser(dbNewUser);
        await this.sendConfirmationEmail(safeUserForEmail, confirmationToken, baseUrl);
        logger.info({ email }, 'Confirmation email sent');
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
        // Не блокируем регистрацию если email не отправился
      }

      // Генерируем токены с безопасным преобразованием типа
      const safeUser = toSafeUser(dbNewUser);
      const tokens = await this.generateTokens(safeUser, rememberMe);
      const sessionType: SessionType = rememberMe ? 'remember_me' : 'normal';

      return {
        user: safeUser,
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
   * Очистка истекших токенов сброса пароля
   */
  async cleanupExpiredPasswordResetTokens(): Promise<void> {
    try {
      await storage.cleanExpiredPasswordResetTokens();
    } catch (error) {
      console.error('Cleanup password reset tokens error:', error);
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
  extractRefreshTokenFromCookies(cookies: unknown): string | null {
    if (!cookies || typeof cookies !== 'object') {
      return null;
    }
    const record = cookies as { refreshToken?: unknown };
    return typeof record.refreshToken === 'string' ? record.refreshToken : null;
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

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Отправляет email подтверждения
   */
  private async sendConfirmationEmail(
    user: Pick<User, "id" | "email" | "username">,
    confirmationToken: string,
    baseUrl?: string
  ): Promise<void> {
    try {
      const profile = await storage.getUserProfile(user.id).catch(() => undefined);
      await emailService.sendRegistrationConfirmation({
        email: user.email,
        username: user.username,
        displayName: profile?.displayName ?? undefined,
        confirmationToken,
        baseUrl,
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
    await storage.updateUserConfirmationToken(user.id, null);
    await storage.updateUserStatus(user.username, 'active');
      
    // Создаем профиль пользователя, если его нет
    try {
      const existingProfile = await storage.getUserProfile(user.id);
      if (!existingProfile) {
        await storage.createOrUpdateUserProfile(user.id, {
          // Если профиль по какой-то причине отсутствует, используем username как fallback.
          displayName: user.username,
          isReader: false,
          bio: null,
          avatar: null,
        });
        logger.info({ userId: user.id }, 'User profile created during email confirmation');
      }
    } catch (profileError) {
      console.error('Failed to create user profile during email confirmation:', profileError);
      // Не блокируем подтверждение email если профиль не создался
    }

    logger.info({ userId: user.id, email: user.email }, 'Email confirmed');
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

/**
 * Запрос на сброс пароля (публичный или админский)
 */
  async requestPasswordReset(
    emailOrUsername: string,
  baseUrl?: string,
  requestedByAdminId?: string,
  requestedFromIp?: string
  ): Promise<{ emailSent: boolean }> {
    try {
      logger.info('[AuthService] Password reset requested');
    
    // Безопасно пытаемся найти пользователя по email или username
    let user = await storage.getUserByEmail(emailOrUsername);
    user ??= await storage.getUserByUsername(emailOrUsername);

    // Не раскрываем существование пользователя
      if (!user || user.status === 'deleted') {
        logger.info('[AuthService] User not found or deleted');
        return { emailSent: false };
      }

      logger.info({ userId: user.id }, '[AuthService] User found');

    // Инвалидируем предыдущие активные токены
    await storage.invalidatePasswordResetTokensForUser(user.id);
    logger.info({ userId: user.id }, '[AuthService] Invalidated previous tokens');

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);
      logger.info('[AuthService] Generated reset token');

    const tokenRecord = await storage.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
      requestedByAdminId,
      requestedFromIp,
    });
    logger.info({ tokenId: tokenRecord.id }, '[AuthService] Created token record');

    logger.info({ userId: user.id }, '[AuthService] Attempting to send reset email');
    const emailSent = await emailService.sendPasswordReset({
      email: user.email,
      username: user.username,
      resetToken: token,
      expiresInMinutes: this.PASSWORD_RESET_EXPIRY_MINUTES,
      baseUrl,
    });

    logger.info({ emailSent }, '[AuthService] Email send result');

    if (!emailSent) {
      logger.warn({ tokenId: tokenRecord.id }, '[AuthService] Email failed, marking token as used');
      await storage.markPasswordResetTokenUsed(tokenRecord.id);
    }

    return { emailSent };
  } catch (error) {
    console.error('[AuthService] Password reset request error:', error);
    return { emailSent: false };
  }
}

/**
 * Смена пароля авторизованным пользователем
 * После смены инвалидируются все refresh-сессии пользователя
 */
async changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string; code?: string; status?: number }> {
  try {
    const user = await storage.getUser(userId);
    if (!user || user.status === 'deleted') {
      return {
        success: false,
        message: 'Пользователь не найден',
        code: 'USER_NOT_FOUND',
        status: 404,
      };
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return {
        success: false,
        message: 'Неверный текущий пароль',
        code: 'INVALID_CURRENT_PASSWORD',
        status: 400,
      };
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return {
        success: false,
        message: 'Новый пароль должен отличаться от текущего',
        code: 'PASSWORD_NOT_CHANGED',
        status: 400,
      };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedUser = await storage.updateUserPassword(user.id, hashedPassword);

    if (!updatedUser) {
      return {
        success: false,
        message: 'Не удалось обновить пароль',
        code: 'PASSWORD_UPDATE_FAILED',
        status: 500,
      };
    }

    await storage.revokeAllUserRefreshTokens(user.id);
    await storage.invalidatePasswordResetTokensForUser(user.id);

    return {
      success: true,
      message: 'Пароль успешно изменен. Выполните вход заново.',
      code: 'PASSWORD_CHANGED_REAUTH_REQUIRED',
      status: 200,
    };
  } catch (error) {
    console.error('Change password error:', error);
    return {
      success: false,
      message: 'Ошибка при смене пароля',
      code: 'CHANGE_PASSWORD_FAILED',
      status: 500,
    };
  }
}

/**
 * Смена email авторизованным пользователем
 * Новый email требует подтверждения, все refresh-сессии инвалидируются
 */
async requestEmailChange(
  userId: string,
  currentPassword: string,
  newEmail: string,
  baseUrl?: string
): Promise<{ success: boolean; message: string; code?: string; status?: number }> {
  try {
    const normalizedEmail = newEmail.trim().toLowerCase();

    const user = await storage.getUser(userId);
    if (!user || user.status === 'deleted') {
      return {
        success: false,
        message: 'Пользователь не найден',
        code: 'USER_NOT_FOUND',
        status: 404,
      };
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return {
        success: false,
        message: 'Неверный текущий пароль',
        code: 'INVALID_CURRENT_PASSWORD',
        status: 400,
      };
    }

    if (user.email.toLowerCase() === normalizedEmail) {
      return {
        success: false,
        message: 'Указан текущий email. Введите новый адрес.',
        code: 'EMAIL_NOT_CHANGED',
        status: 400,
      };
    }

    const existingUserByEmail = await storage.getUserByEmail(normalizedEmail);
    if (existingUserByEmail && existingUserByEmail.id !== user.id) {
      return {
        success: false,
        message: 'Пользователь с таким email уже существует',
        code: 'EMAIL_ALREADY_IN_USE',
        status: 409,
      };
    }

    const confirmationToken = randomBytes(32).toString('hex');
    const profile = await storage.getUserProfile(user.id).catch(() => undefined);
    const emailSent = await emailService.sendRegistrationConfirmation({
      email: normalizedEmail,
      username: user.username,
      displayName: profile?.displayName ?? undefined,
      confirmationToken,
      baseUrl,
    });

    if (!emailSent) {
      return {
        success: false,
        message: 'Не удалось отправить письмо подтверждения на новый email',
        code: 'EMAIL_CONFIRMATION_SEND_FAILED',
        status: 503,
      };
    }

    const updatedUser = await storage.updateUserEmail(user.id, normalizedEmail, confirmationToken);
    if (!updatedUser) {
      return {
        success: false,
        message: 'Не удалось обновить email',
        code: 'EMAIL_UPDATE_FAILED',
        status: 500,
      };
    }

    await storage.revokeAllUserRefreshTokens(user.id);

    return {
      success: true,
      message: 'Email изменен. Подтвердите новый адрес через письмо и войдите заново.',
      code: 'EMAIL_CHANGED_CONFIRMATION_REQUIRED',
      status: 200,
    };
  } catch (error) {
    console.error('Request email change error:', error);
    return {
      success: false,
      message: 'Ошибка при смене email',
      code: 'CHANGE_EMAIL_FAILED',
      status: 500,
    };
  }
}

/**
 * Сброс пароля по токену
 */
async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!token) {
      return { success: false, message: 'Токен обязателен' };
    }

    const tokenHash = this.hashToken(token);
    const tokenRecord = await storage.getPasswordResetTokenByHash(tokenHash);

    if (!tokenRecord || tokenRecord.usedAt) {
      return { success: false, message: 'Недействительный или использованный токен' };
    }

    if (tokenRecord.expiresAt < new Date()) {
      return { success: false, message: 'Токен истек' };
    }

    const user = await storage.getUser(tokenRecord.userId);
    if (!user) {
      return { success: false, message: 'Пользователь не найден' };
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await storage.updateUserPassword(user.id, hashedPassword);
    await storage.markPasswordResetTokenUsed(tokenRecord.id);

    // Отзываем все refresh токены пользователя
    await storage.revokeAllUserRefreshTokens(user.id);

    return { success: true, message: 'Пароль успешно обновлен' };
  } catch (error) {
    console.error('Password reset error:', error);
    return { success: false, message: 'Ошибка при сбросе пароля' };
  }
}
}

// Ленивая инициализация singleton instance
let _authServiceInstance: AuthService | undefined;

export function getAuthService(): AuthService {
  _authServiceInstance ??= new AuthService();
  return _authServiceInstance;
}

// Для обратной совместимости
export const authService = new Proxy({} as AuthService, {
  get(_target, prop) {
    return getAuthService()[prop as keyof AuthService];
  }
});
