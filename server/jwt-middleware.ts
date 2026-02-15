import type { Request, Response, NextFunction } from "express";
import { authService } from "./auth-service.js";
import type { JWTPayload } from "./auth-service";
import { logger } from "./lib/logger.js";

// Расширяем JWTPayload для включения id
export interface ExtendedJWTPayload extends JWTPayload {
  id: string;
  status?: string; // Статус пользователя: pending, active, suspended, deleted
}

// Расширяем Request interface для добавления user
declare global {
  namespace Express {
    interface Request {
      user?: ExtendedJWTPayload;
    }
  }
}

/**
 * Middleware для проверки JWT токена
 */
export function jwtAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Пытаемся извлечь токен из заголовка Authorization
    const authHeader = req.headers.authorization;
    let token = authService.extractTokenFromHeader(authHeader);
    
    // Если нет в header, проверяем cookies
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      logger.debug('[jwtAuth] No token found in header or cookies');
      return res.status(401).json({
        message: "Требуется аутентификация",
        code: "NO_TOKEN"
      });
    }

    const payload = authService.verifyAccessToken(token);
    if (!payload) {
      logger.debug('[jwtAuth] Invalid or expired token');
      return res.status(401).json({
        message: "Недействительный или истекший токен",
        code: "INVALID_TOKEN"
      });
    }

    // Добавляем данные пользователя в request
    req.user = { ...payload, id: payload.userId };
    next();
  } catch (error) {
    logger.error({ error }, 'JWT Auth middleware error');
    return res.status(500).json({
      message: "Ошибка аутентификации",
      code: "AUTH_ERROR"
    });
  }
}

/**
 * Middleware для проверки роли администратора
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ 
      message: "Требуется аутентификация",
      code: "NO_AUTH"
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      message: "Требуются права администратора",
      code: "INSUFFICIENT_PERMISSIONS"
    });
  }

  next();
}

/**
 * Middleware для проверки роли модератора или администратора
 */
export function requireModerator(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ 
      message: "Требуется аутентификация",
      code: "NO_AUTH"
    });
  }

  if (!['admin', 'moderator'].includes(req.user.role)) {
    return res.status(403).json({ 
      message: "Требуются права модератора",
      code: "INSUFFICIENT_PERMISSIONS"
    });
  }

  next();
}

/**
 * Middleware для проверки активного статуса пользователя
 * Требует, чтобы пользователь был активирован (status === 'active')
 */
export function requireActiveUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ 
      message: "Требуется аутентификация",
      code: "NO_AUTH"
    });
  }

  // Если пользователь - админ или модератор, пропускаем проверку статуса
  if (['admin', 'moderator'].includes(req.user.role)) {
    return next();
  }

  // Для обычных пользователей проверяем статус в БД
  // Используем асинхронную проверку
  (async () => {
    try {
      const { storage } = await import('./repositories/index.js');
      const user = await storage.getUser(req.user!.userId);
      
      if (!user) {
        return res.status(401).json({ 
          message: "Пользователь не найден",
          code: "USER_NOT_FOUND"
        });
      }

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

      // Проверяем подтверждение email
      if (!user.emailConfirmed) {
        return res.status(403).json({
          message: "Необходимо подтвердить email для доступа к этой функции.",
          code: "EMAIL_NOT_CONFIRMED",
          userStatus: user.status
        });
      }

      next();
    } catch (error) {
      console.error('Error checking user status:', error);
      return res.status(500).json({
        message: "Ошибка проверки статуса пользователя",
        code: "STATUS_CHECK_ERROR"
      });
    }
  })();
}

/**
 * Опциональный JWT middleware - не блокирует запрос если токена нет
 */
export function optionalJwtAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token = authService.extractTokenFromHeader(authHeader);

    if (token) {
      const payload = authService.verifyAccessToken(token);
      if (payload) {
        req.user = { ...payload, id: payload.userId };
      }
    }

    next();
  } catch (error) {
    console.error('Optional JWT Auth middleware error:', error);
    next(); // Продолжаем выполнение даже при ошибке
  }
}

/**
 * Middleware для извлечения пользователя из токена без проверки валидности
 * Используется для WebSocket аутентификации
 */
export function extractUserFromToken(token: string): JWTPayload | null {
  return authService.verifyAccessToken(token);
}

/**
 * Middleware для извлечения пользователя из токена с полной проверкой в БД
 */
export async function jwtAuthWithUserCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token = authService.extractTokenFromHeader(authHeader);

    if (!token) {
      return res.status(401).json({
        message: "Требуется аутентификация",
        code: "NO_TOKEN"
      });
    }

    // Получаем полные данные пользователя из БД
    const user = await authService.getCurrentUser(token);
    if (!user) {
      return res.status(401).json({
        message: "Недействительный токен или пользователь не найден",
        code: "INVALID_USER"
      });
    }

    // Добавляем полные данные пользователя в request
    req.user = {
      userId: user.id,
      username: user.username,
      role: user.role,
      id: user.id
    };
    
    next();
  } catch (error) {
    console.error('JWT Auth with user check middleware error:', error);
    return res.status(500).json({
      message: "Ошибка аутентификации",
      code: "AUTH_ERROR"
    });
  }
}
