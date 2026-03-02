import type { Request, Response, NextFunction } from "express";
import * as GuestRepo from "../repositories/GuestRepository.js";
import { logger } from "../lib/logger.js";

/**
 * Расширяем Request для guest данных
 */
declare global {
  namespace Express {
    interface Request {
      guestId?: string;
      guestAccount?: Awaited<ReturnType<typeof GuestRepo.getGuestById>>;
    }
  }
}

/**
 * Middleware: опциональная guest аутентификация
 * - Пытается найти guest по cookie
 * - Не блокирует запрос если guest не найден
 * - Записывает guestId в req.guestId если найден
 */
export async function guestAuthOptional(req: Request, res: Response, next: NextFunction) {
  try {
    const guestId = req.cookies?.guest_id;

    if (!guestId) {
      return next();
    }

    // Проверяем, что guest существует и не истек
    const guest = await GuestRepo.getGuestById(guestId);

    if (!guest) {
      // Guest не найден - очищаем cookie
      res.clearCookie("guest_id");
      return next();
    }

    if (guest.status !== "active") {
      res.clearCookie("guest_id");
      return next();
    }

    if (guest.expiresAt < new Date()) {
      // Guest истек - очищаем cookie
      res.clearCookie("guest_id");
      return next();
    }

    // Guest валиден - записываем в request
    req.guestId = guest.id;
    req.guestAccount = guest;

    // Обновляем last_seen
    await GuestRepo.updateLastSeen(guest.id);

    next();
  } catch (error) {
    logger.error({ error }, "Error in guestAuthOptional middleware");
    next(error);
  }
}

/**
 * Middleware: обязательная guest аутентификация
 * - Требует валидный guest в cookie
 * - Возвращает 401 если guest не найден или истек
 */
export async function guestAuthRequired(req: Request, res: Response, next: NextFunction) {
  try {
    // Сначала проверяем optional middleware
    await guestAuthOptional(req, res, () => {});

    if (!req.guestId) {
      return res.status(401).json({
        message: "Требуется гостевой доступ",
        code: "GUEST_REQUIRED",
      });
    }

    next();
  } catch (error) {
    logger.error({ error }, "Error in guestAuthRequired middleware");
    return res.status(500).json({
      message: "Ошибка аутентификации",
      code: "GUEST_AUTH_ERROR",
    });
  }
}

/**
 * Утилита: установить guest cookie
 */
export function setGuestCookie(res: Response, guestId: string, maxAgeDays: number = 30): void {
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000; // days to ms

  res.cookie("guest_id", guestId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  });
}

/**
 * Утилита: очистить guest cookie
 */
export function clearGuestCookie(res: Response): void {
  res.clearCookie("guest_id", {
    path: "/",
  });
}

/**
 * Утилита: получить fingerprint браузера
 * Простой hash на основе User-Agent и Accept-Language
 */
export function getBrowserFingerprint(req: Request): string | null {
  const userAgent = req.headers["user-agent"];
  const acceptLanguage = req.headers["accept-language"];

  if (!userAgent) {
    return null;
  }

  // Простой hash (не криптографический, но достаточный для fingerprint)
  const str = `${userAgent}|${acceptLanguage || ""}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(36);
}
