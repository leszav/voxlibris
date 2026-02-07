import type { Express, Request, Response } from "express";
import { z } from "zod";
import cookieParser from "cookie-parser";
import { authService } from "./auth-service.js";
import { storage } from "./repositories/index.js";
import { jwtAuth } from "./jwt-middleware.js";
import { insertUserSchema } from "../shared/schema.js";

// Password validation schema
const passwordSchema = z.string()
  .min(8, "Пароль должен содержать минимум 8 символов")
  .regex(/[A-Za-z]/, "Пароль должен содержать хотя бы одну букву")
  .regex(/\d/, "Пароль должен содержать хотя бы одну цифру");

// Registration schema with password validation
const registerSchema = insertUserSchema.extend({
  password: passwordSchema
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
  email: z.string().email().optional(),
  username: z.string().min(1).optional(),
}).refine(data => data.email || data.username, {
  message: "Either username or email must be provided"
});

// Reset password schema
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
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
        return res.status(400).json({
          message: "Ошибка валидации данных",
          errors: validation.error.issues
        });
      }

      const validatedData = validation.data as { username: string; email: string; password: string; invitedBy?: string; invitedToClub?: string; status?: string };
      const { username, email, password } = validatedData;
      const { rememberMe = false } = req.body;
      const inviteToken = (req.body.invite || req.query.invite) as string | undefined;

      // Валидация приглашения
      const inviteValidation = await validateAndProcessInvite(inviteToken, email);
      if ('error' in inviteValidation) {
        return res.status(inviteValidation.error.status).json({
          message: inviteValidation.error.message,
          ...(inviteValidation.error.code && { code: inviteValidation.error.code })
        });
      }

      const { invitedBy, invitedToClub } = inviteValidation;

      // Извлекаем базовый URL из запроса
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const authResult = await authService.register(
        username,
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
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: accessMaxAge,
      });

      res.cookie('refreshToken', authResult.tokens.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: refreshMaxAge,
      });

      res.status(201).json({
        message: "Пользователь успешно зарегистрирован",
        user: authResult.user,
        accessToken: authResult.tokens.accessToken,
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
      const refreshMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const accessMaxAge = rememberMe ? 2 * 60 * 60 * 1000 : 15 * 60 * 1000;
      const isProduction = process.env.NODE_ENV === 'production';

      res.cookie('accessToken', authResult.tokens.accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: accessMaxAge,
      });

      res.cookie('refreshToken', authResult.tokens.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: refreshMaxAge,
      });

      res.json({
        message: "Успешный вход в систему",
        user: authResult.user,
        accessToken: authResult.tokens.accessToken,
        sessionType: authResult.sessionType
      });
    } catch (error) {
      console.error("Login error:", error);
      
      // Обработка специфичных ошибок
      if (error instanceof Error && (error.message === 'ACCOUNT_SUSPENDED' || error.message === 'ACCOUNT_DELETED')) {
        const isSuspended = error.message === 'ACCOUNT_SUSPENDED';
        return res.status(403).json({ 
          message: isSuspended ? "Аккаунт заблокирован администратором" : "Аккаунт удален",
          code: error.message
        });
      }
      
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Ошибка сервера" 
      });
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

      const baseUrl = `${req.protocol}://${req.get('host')}`;
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
      const refreshMaxAge = result.sessionType === 'remember_me' 
        ? 30 * 24 * 60 * 60 * 1000 
        : 7 * 24 * 60 * 60 * 1000;
      const accessMaxAge = result.sessionType === 'remember_me'
        ? 2 * 60 * 60 * 1000
        : 15 * 60 * 1000;
      const isProduction = process.env.NODE_ENV === 'production';

      res.cookie('accessToken', result.newTokens.accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: accessMaxAge,
      });

      res.cookie('refreshToken', result.newTokens.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: refreshMaxAge,
      });

      res.json({
        accessToken: result.newTokens.accessToken
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
      res.clearCookie('refreshToken');
      res.clearCookie('accessToken');
      
      res.json({ message: "Успешный выход из системы" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Ошибка выхода из системы" });
    }
  });

  // Get current user endpoint
  app.get("/api/auth/me", jwtAuth, (req: Request, res: Response) => {
    res.json({
      user: {
        id: req.user!.userId,
        username: req.user!.username,
        role: req.user!.role
      }
    });
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

      const result = await authService.resendConfirmationEmail(userId);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
          code: "RESEND_FAILED"
        });
      }
    } catch (error) {
      console.error('Resend confirmation email error:', error);
      res.status(500).json({
        message: "Ошибка при повторной отправке письма"
      });
    }
  });

  // NOTE: Admin endpoints moved to admin-routes.ts to avoid conflicts
}
