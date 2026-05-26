import type { Express, Request, Response } from "express";
import { z } from "zod";
import cookieParser from "cookie-parser";
import { authService } from "./auth-service.js";
import { storage } from "./repositories/index.js";
import { jwtAuth, requireActiveUser } from "./jwt-middleware.js";
import { serializeAuthUser } from "./lib/client-serializers.js";
import { getPublicBaseUrl } from "./lib/public-base-url.js";
// insertUserSchema больше не используется: схема регистрации локальная,
// чтобы не тащить ограничения users.username на displayName.

// Email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Username validation: only A-Za-z0-9_- allowed, 3-32 chars
const USERNAME_REGEX = /^[A-Za-z0-9_-]{3,32}$/;

// Display name validation: allow Cyrillic/Latin letters, digits, spaces, _ and -
// 2-50 chars, no leading/trailing spaces, no multiple spaces
const DISPLAY_NAME_REGEX = /^[\p{L}\p{N}][\p{L}\p{N}_ -]{0,48}[\p{L}\p{N}]$/u;

// Password validation schema
const passwordSchema = z.string()
  .min(8, "Пароль должен содержать минимум 8 символов")
  .regex(/[A-Za-z]/, "Пароль должен содержать хотя бы одну букву")
  .regex(/\d/, "Пароль должен содержать хотя бы одну цифру");

// Registration schema with password validation
// ВАЖНО: на фронте поле называется displayName. Для обратной совместимости
// принимаем и username (старые клиенты), трактуя его как displayName.
const registerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Укажите имя (минимум 2 символа)")
    .max(50, "Имя слишком длинное (максимум 50 символов)")
    .regex(DISPLAY_NAME_REGEX, "Имя может содержать буквы (в т.ч. кириллицу), цифры, пробелы, _ и -")
    .transform((value) => value.replace(/\s+/gu, " "))
    .optional(),
  // Legacy field
  username: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(EMAIL_REGEX, "Укажите корректный email"),
  password: passwordSchema,
  rememberMe: z.boolean().optional(),
  invite: z.string().optional(),
}).refine((data) => Boolean(data.displayName || data.username), {
  message: "displayName is required",
  path: ["displayName"],
});

// Login schema
const loginSchema = z.object({
  password: z.string(),
  username: z.string().optional(),
  email: z.string().optional(),
  rememberMe: z.boolean().optional()
}).refine(data => data.username || data.email, {
  message: "Either username or email must be provided"
});

// Forgot password schema
const forgotPasswordSchema = z.object({
  email: z.string().regex(EMAIL_REGEX, "Invalid email format").optional(),
  username: z.string().min(1).optional(),
}).refine(data => data.email || data.username, {
  message: "Either username or email must be provided"
});

function respondToLoginError(error: unknown, res: Response): Response {
  console.error("Login error:", error);

  if (error instanceof Error && error.message === 'EMAIL_NOT_CONFIRMED') {
    return res.status(403).json({
      message: "Подтвердите email для входа",
      code: "EMAIL_NOT_CONFIRMED",
      userStatus: "pending"
    });
  }

  if (error instanceof Error && (error.message === 'ACCOUNT_SUSPENDED' || error.message === 'ACCOUNT_DELETED')) {
    const isSuspended = error.message === 'ACCOUNT_SUSPENDED';
    return res.status(403).json({
      message: isSuspended ? "Аккаунт заблокирован администратором" : "Аккаунт удален",
      code: error.message
    });
  }

  return res.status(500).json({
    message: error instanceof Error ? error.message : "Ошибка сервера"
  });
}

// Reset password schema
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Текущий пароль обязателен"),
  newPassword: passwordSchema,
});

// Валидация и обработка приглашения при регистрации
async function validateAndProcessInvite(
  inviteToken: string | undefined,
  email: string
): Promise<{ invitedBy?: string; invitedToClub?: string } | { error: { status: number; message: string; code?: string } }> {
  if (!inviteToken) {
    return {};
  }

  const invitation = await storage.getClubInvitation(inviteToken).catch((err) => {
    console.warn('Invite token lookup failed during registration:', err);
    return null;
  });

  if (!invitation) {
    return { error: { status: 400, message: 'Неверный или отсутствующий токен приглашения' } };
  }

  const expiresAt = invitation.expiresAt ? new Date(invitation.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) {
    await storage.updateInvitationStatus(inviteToken, 'expired').catch(() => {});
    return { error: { status: 410, message: 'Приглашение истекло' } };
  }

  if (invitation.email && invitation.email.toLowerCase() !== email.toLowerCase()) {
    return { error: { status: 400, message: 'Email в регистрации должен совпадать с email, на который отправлено приглашение', code: 'INVITE_EMAIL_MISMATCH' } };
  }

  if (invitation.status !== 'pending') {
    return { error: { status: 409, message: `Приглашение уже имеет статус: ${invitation.status}` } };
  }

  return { invitedBy: invitation.invitedBy, invitedToClub: invitation.clubId };
}

// Присоединение пользователя к клубу по приглашению
async function joinClubByInvite(inviteToken: string | undefined, invitedToClub: string | undefined, userId: string | undefined): Promise<void> {
  if (!invitedToClub || !userId) return;

  try {
    await storage.joinClub(invitedToClub, userId, 'member');
    if (inviteToken) {
      await storage.updateInvitationStatus(inviteToken, 'accepted', new Date());
    }
  } catch (err) {
    console.error('Failed to auto-join user to invited club:', err);
  }
}

export function setupAuthRoutes(app: Express): void {
  // Setup cookie parser
  app.use(cookieParser());

  // Registration endpoint
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const validation = registerSchema.safeParse(req.body);
      
      if (!validation.success) {
        const emailIssue = validation.error.issues.find((issue) => issue.path.includes("email"));
        return res.status(400).json({
          message: emailIssue?.message || "Ошибка валидации данных",
          errors: validation.error.issues
        });
      }

      const validatedData = validation.data as { displayName?: string; username?: string; email: string; password: string };
      const { email, password } = validatedData;
      const displayName = (validatedData.displayName ?? validatedData.username ?? '').trim();
      const { rememberMe = false } = validation.data;
      const inviteToken = (validation.data.invite || req.query.invite) as string | undefined;

      if (!displayName) {
        return res.status(400).json({
          message: "Укажите имя",
          code: "DISPLAY_NAME_REQUIRED",
        });
      }

      // Валидация приглашения
      const inviteValidation = await validateAndProcessInvite(inviteToken, email);
      if ('error' in inviteValidation) {
        return res.status(inviteValidation.error.status).json({
          message: inviteValidation.error.message,
          ...(inviteValidation.error.code && { code: inviteValidation.error.code })
        });
      }

      const { invitedBy, invitedToClub } = inviteValidation;

      // Используем только доверенный URL приложения из конфигурации
      const baseUrl = await getPublicBaseUrl();

      const authResult = await authService.register(
        displayName,
        email,
        password,
        invitedBy,
        invitedToClub,
        rememberMe,
        baseUrl
      );

      // Присоединение к клубу по приглашению
      await joinClubByInvite(inviteToken, invitedToClub, authResult.user?.id);

      // Set tokens as httpOnly cookies
      const refreshMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const accessMaxAge = rememberMe ? 2 * 60 * 60 * 1000 : 15 * 60 * 1000;
      const isProduction = process.env.NODE_ENV === 'production';

      res.cookie('accessToken', authResult.tokens.accessToken, {
        httpOnly: false, // Доступен для JavaScript (WebSocket и client-side проверки)
        secure: isProduction,
        sameSite: 'strict',
        maxAge: accessMaxAge,
        path: '/',
      });

      res.cookie('refreshToken', authResult.tokens.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: refreshMaxAge,
        path: '/',
      });

      res.status(201).json({
        message: "Пользователь успешно зарегистрирован",
        user: serializeAuthUser({
          ...authResult.user,
          displayName: displayName,
        }),
        sessionType: authResult.sessionType
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Ошибка сервера" 
      });
    }
  });

  // Login endpoint
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          message: "Ошибка валидации данных",
          errors: validation.error.issues
        });
      }

      const { username, email, password, rememberMe = false } = validation.data;
      const emailOrUsername = email || username;

      if (!emailOrUsername) {
        return res.status(400).json({ 
          message: "Требуются email или username" 
        });
      }

      const authResult = await authService.authenticate(emailOrUsername, password, rememberMe);
      
      if (!authResult) {
        return res.status(401).json({ 
          message: "Неверные данные для входа" 
        });
      }

      // Set tokens as httpOnly cookies
      // accessToken доступен JS для WebSocket и client-side проверок
      // refreshToken остается httpOnly для максимальной безопасности
      const refreshMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const accessMaxAge = rememberMe ? 2 * 60 * 60 * 1000 : 15 * 60 * 1000;
      const isProduction = process.env.NODE_ENV === 'production';

      res.cookie('accessToken', authResult.tokens.accessToken, {
        httpOnly: false, // Доступен для JavaScript
        secure: isProduction,
        sameSite: 'strict',
        maxAge: accessMaxAge,
        path: '/',
      });

      res.cookie('refreshToken', authResult.tokens.refreshToken, {
        httpOnly: true, // Защищен от XSS
        secure: isProduction,
        sameSite: 'strict',
        maxAge: refreshMaxAge,
        path: '/',
      });

      const profile = await storage.getUserProfile(authResult.user.id).catch(() => undefined);

      res.json({
        message: "Успешный вход в систему",
        user: serializeAuthUser({
          ...authResult.user,
          displayName: profile?.displayName ?? null,
        }),
        sessionType: authResult.sessionType
      });
    } catch (error) {
      return respondToLoginError(error, res);
    }
  });

  // Forgot password endpoint
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const validation = forgotPasswordSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          message: "Ошибка валидации данных",
          errors: validation.error.issues
        });
      }

      const { email, username } = validation.data;
      const emailOrUsername = email || username;

      const baseUrl = await getPublicBaseUrl();
      await authService.requestPasswordReset(
        emailOrUsername!,
        baseUrl,
        undefined,
        req.ip
      );

      // Всегда возвращаем успешный ответ, чтобы не раскрывать существование пользователя
      res.json({
        message: "Если пользователь существует, мы отправили письмо с инструкциями по сбросу пароля"
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Ошибка запроса сброса пароля" });
    }
  });

  // Reset password endpoint
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const validation = resetPasswordSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          message: "Ошибка валидации данных",
          errors: validation.error.issues
        });
      }

      const { token, password } = validation.data;
      const result = await authService.resetPassword(token, password);

      if (result.success) {
        return res.json({
          success: true,
          message: result.message
        });
      }

      return res.status(400).json({
        success: false,
        message: result.message
      });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Ошибка сброса пароля" });
    }
  });

  // Refresh token endpoint
  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    try {
      const refreshToken = authService.extractRefreshTokenFromCookies(req.cookies);
      
      if (!refreshToken) {
        return res.status(401).json({ 
          message: "Refresh token не найден" 
        });
      }

      const result = await authService.refreshTokens(refreshToken);
      
      if (!result) {
        return res.status(401).json({ 
          message: "Недействительный refresh token" 
        });
      }

      // Set new tokens as httpOnly cookies
      // accessToken доступен JS для WebSocket и client-side проверок
      // refreshToken остается httpOnly для максимальной безопасности
      const refreshMaxAge = result.sessionType === 'remember_me' 
        ? 30 * 24 * 60 * 60 * 1000 
        : 7 * 24 * 60 * 60 * 1000;
      const accessMaxAge = result.sessionType === 'remember_me'
        ? 2 * 60 * 60 * 1000
        : 15 * 60 * 1000;
      const isProduction = process.env.NODE_ENV === 'production';

      res.cookie('accessToken', result.newTokens.accessToken, {
        httpOnly: false, // Доступен для JavaScript
        secure: isProduction,
        sameSite: 'strict',
        maxAge: accessMaxAge,
        path: '/',
      });

      res.cookie('refreshToken', result.newTokens.refreshToken, {
        httpOnly: true, // Защищен от XSS
        secure: isProduction,
        sameSite: 'strict',
        maxAge: refreshMaxAge,
        path: '/',
      });

      res.json({
        success: true,
        sessionType: result.sessionType
      });
    } catch (error) {
      console.error("Refresh token error:", error);
      res.status(500).json({ message: "Ошибка обновления токена" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const refreshToken = authService.extractRefreshTokenFromCookies(req.cookies);
      
      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      // Clear all auth cookies
      res.clearCookie('refreshToken', { path: '/' });
      res.clearCookie('accessToken', { path: '/' });
      
      res.json({ message: "Успешный выход из системы" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Ошибка выхода из системы" });
    }
  });

  // Get current user endpoint
  app.get("/api/auth/me", jwtAuth, async (req: Request, res: Response) => {
    try {
      // Получаем полные данные пользователя из БД
      const user = await storage.getUser(req.user!.userId);
      const profile = await storage.getUserProfile(req.user!.userId);
      
      if (!user) {
        return res.status(404).json({
          message: "Пользователь не найден"
        });
      }

      // Проверяем статус пользователя - для админов и модераторов пропускаем проверку
      if (!['admin', 'moderator'].includes(user.role)) {
        if (user.status !== 'active') {
          const statusMessages = {
            pending: "Ваш аккаунт ожидает подтверждения email.",
            suspended: "Ваш аккаунт заблокирован.",
            deleted: "Ваш аккаунт удалён."
          };
          
          return res.status(403).json({
            message: statusMessages[user.status] || "Ваш аккаунт неактивен.",
            code: "ACCOUNT_NOT_ACTIVATED",
            userStatus: user.status
          });
        }

        // Проверяем подтверждение email для обычных пользователей
        if (!user.emailConfirmed) {
          return res.status(403).json({
            message: "Необходимо подтвердить email для доступа к этой функции.",
            code: "EMAIL_NOT_CONFIRMED",
            userStatus: user.status
          });
        }
      }

      res.json({
        user: serializeAuthUser({
          ...user,
          displayName: profile?.displayName ?? null,
          avatar: profile?.avatar ?? null,
        })
      });
    } catch (error) {
      console.error("Get current user error:", error);
      res.status(500).json({ message: "Ошибка получения данных пользователя" });
    }
  });

  // Change password endpoint (authenticated)
  app.post("/api/auth/change-password", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: "Требуется аутентификация",
          code: "NO_AUTH"
        });
      }

      const validation = changePasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Ошибка валидации данных",
          errors: validation.error.issues,
        });
      }

      const { currentPassword, newPassword } = validation.data;
      if (currentPassword === newPassword) {
        return res.status(400).json({
          message: "Новый пароль должен отличаться от текущего",
          code: "PASSWORD_NOT_CHANGED"
        });
      }

      const result = await authService.changePassword(req.user.userId, currentPassword, newPassword);
      if (!result.success) {
        return res.status(result.status ?? 400).json({
          message: result.message,
          ...(result.code && { code: result.code }),
        });
      }

      res.clearCookie('refreshToken', { path: '/' });
      res.clearCookie('accessToken', { path: '/' });

      return res.json({
        success: true,
        message: result.message,
        ...(result.code && { code: result.code }),
      });
    } catch (error) {
      console.error('Change password endpoint error:', error);
      return res.status(500).json({
        message: "Ошибка при смене пароля",
        code: "CHANGE_PASSWORD_FAILED"
      });
    }
  });

  // Email confirmation endpoints
  app.post("/api/auth/confirm-email", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({
          message: "Токен подтверждения обязателен",
          code: "TOKEN_REQUIRED"
        });
      }

      const result = await authService.confirmEmail(token);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
          code: "CONFIRMATION_FAILED"
        });
      }
    } catch (error) {
      console.error('Email confirmation error:', error);
      res.status(500).json({
        message: "Ошибка при подтверждении email"
      });
    }
  });

  // Resend confirmation email endpoint
  app.post("/api/auth/resend-confirmation", async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({
          message: "ID пользователя обязателен",
          code: "USER_ID_REQUIRED"
        });
      }

      await authService.resendConfirmationEmail(userId);

      res.json({
        success: true,
        message: "Если аккаунт существует, письмо отправлено"
      });
    } catch (error) {
      console.error('Resend confirmation email error:', error);
      res.json({
        success: true,
        message: "Если аккаунт существует, письмо отправлено"
      });
    }
  });

  // Change username endpoint (для пользователей у которых username содержит @)
  app.put("/api/auth/username", jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        return res.status(401).json({ message: "Не аутентифицирован" });
      }

      const { username } = req.body;
      if (!username || !USERNAME_REGEX.test(username)) {
        return res.status(400).json({
          message: "Имя пользователя может содержать только буквы (A-Z, a-z), цифры, _ и -, от 3 до 32 символов",
          code: "INVALID_USERNAME"
        });
      }

      // Проверяем уникальность
      const existing = await storage.getUserByUsername(username);
      if (existing && existing.id !== currentUser.userId) {
        return res.status(409).json({ message: "Это имя пользователя уже занято", code: "USERNAME_TAKEN" });
      }

      const updated = await storage.updateUserUsername(currentUser.userId, username);
      if (!updated) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      const { password: _p, ...safeUser } = updated;
      res.json({ message: "Имя пользователя обновлено", user: safeUser });
    } catch (error) {
      console.error("Change username error:", error);
      res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // NOTE: Admin endpoints moved to admin-routes.ts to avoid conflicts
}
