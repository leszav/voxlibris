/**
 * VoxLibris Server Entry Point
 * 
 * IMPORTANT: Environment variables are loaded via --import flag
 * See package.json scripts for proper startup commands
 */

import { createServer } from "node:http";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";
import slowDown from "express-slow-down";
import helmet from "helmet";
import { Server as SocketIOServer } from "socket.io";
import jwt, { type JwtPayload } from "jsonwebtoken";
import adminRoutes from "./admin-routes.js";
import analyticsRoutes from "./analytics-routes.js";
import { setupAuthRoutes } from "./auth-routes.js";
import guestRoutes from "./guest-routes.js";
import { authService } from "./auth-service.js";
import debugRoutes from "./debug-routes.js";
import clubReaderRoutes from "./club-reader-routes.js";
import clubRoutes from "./club-routes.js";
import readingStatusRoutes from "./reading-status-routes.js";
import { validateEnvironment } from "./config/validate.js";
import { jwtAuth, optionalJwtAuth } from "./jwt-middleware.js";
import { registerRoutes } from "./routes.js";
import readerRoutes from "./routes/reader.js";
import feedbackRoutes from "./routes/feedback.js";
import { serveStatic } from "./static.js";
import { setupWebSocketHandlers } from "./websocket.js";
import { initializeReaderWebSocket } from "./websocket-reader.js";
import { initializeChatWebSocket } from "./websocket-chat.js";
import { initializeDmHandlers } from "./websocket-dm.js";
import { setupReadingSessionsHandlers } from "./websocket/reading-sessions.js";
import { scheduler } from "./services/scheduler.js";
import readingSessionsRoutes from "./routes/reading-sessions.js";
import reactionsRoutes from "./routes/reactions.js";
import { registerIO } from "./lib/socket-registry.js";
import questionsRoutes from "./routes/questions.js";
import scheduleRoutes from "./routes/schedule.js";
import studioStreamRouter from "./routes/studio-stream.js";
import socialRoutes from "./routes/social.js";
import feedRoutes from "./routes/feed.js";
import usersRoutes from "./routes/users.js";
import presenceRoutes from "./routes/presence.js";
import dmRoutes from "./routes/direct-messages.js";
import gamificationAdminRoutes from "./routes/gamification-admin.js";
import gamificationRoutes from "./routes/gamification.js";
import { logger } from "./lib/logger.js";
import { loadFeatureFlags } from "./lib/feature-flags.js";
import { responseCompression } from "./lib/response-compression.js";
import { createIcecastLiveProxy } from "./lib/icecast-live-proxy.js";

export const app = express();

function formatUnknownError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	try {
		return JSON.stringify(error);
	} catch {
		return "Unknown error";
	}
}

// Trust proxy для корректной работы rate limiting за reverse proxy (CapRover/Traefik)
// trust proxy: 1 — trust only first hop, предотвращает spoofing от пользователей
app.set('trust proxy', 1);
const httpServer = createServer(app);

// Studio ingest использует long-lived streaming POST, который не завершает body
// до ручной остановки эфира. У Node.js по умолчанию requestTimeout = 300s,
// из-за чего такие запросы обрываются примерно через 5 минут.
httpServer.requestTimeout = 0;

// CORS: allowed origins (used by Express, Socket.IO, and WebSocket servers)
const allowedOrigins = process.env.ALLOWED_ORIGINS
	? process.env.ALLOWED_ORIGINS.split(",")
	: ["http://localhost:3000"];

const io = new SocketIOServer(httpServer, {
	cors: {
		origin: allowedOrigins,
		methods: ["GET", "POST"],
		credentials: true,
	},
	transports: ["websocket", "polling"],
});
registerIO(io);

// Опциональная аутентификация для главного Socket.IO.
// Не блокирует анонимных клиентов — просто декодирует JWT если он есть
// и сохраняет userId в socket.data для DM-обработчиков.
io.use((socket, next) => {
	try {
		const auth = socket.handshake.auth as Record<string, unknown> | undefined;
		const token =
			(typeof auth?.token === 'string' ? auth.token : undefined) ||
			socket.handshake.headers.authorization?.replace('Bearer ', '') ||
			/accessToken=([^;]+)/.exec(socket.handshake.headers.cookie ?? '')?.[1];

		if (token) {
			const secret = process.env.JWT_SECRET;
			if (secret) {
				const decoded = jwt.verify(token, secret) as JwtPayload & { userId?: string };
				if (decoded.userId) {
					socket.data.userId = decoded.userId;
				}
			}
		}
	} catch {
		// Игнорируем ошибки auth — разрешаем анонимные соединения
	}
	next();
});

// Главный Socket.IO: пользователи могут присоединяться к своей персональной комнате
// для получения real-time событий ленты (feed:new_event).
// Клиент должен вызвать emit('join_user_room', userId) после подключения.
io.on('connection', (socket) => {
	socket.on('join_user_room', (userId: unknown) => {
		if (typeof userId === 'string' && userId.length > 0 && userId.length < 64) {
			void socket.join(`user:${userId}`);
		}
	});
});

// Utility functions
export function log(message: string, source = "express") {
	const formattedTime = new Date().toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
	});

	logger.info(`${formattedTime} [${source}] ${message}`);
}

// Проверка чувствительных ключей
function isSensitiveKey(key: string): boolean {
	const lowerKey = key.toLowerCase();
	const sensitiveKeys = ["password", "token", "secret", "apikey", "api_key", "accesstoken", "refreshtoken"];
	return sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive));
}

// Проверка ключей с большими данными
function isLargeDataKey(key: string): boolean {
	const lowerKey = key.toLowerCase();
	const largeDataKeys = ["coverimage", "image", "avatar", "encryptedcontentkey"];
	return largeDataKeys.some((large) => lowerKey.includes(large));
}

// Маскирование строковых значений
function maskStringValue(value: string): string {
	if (value.startsWith("data:image/") && value.length > 200) {
		return `[Base64 image: ${value.length} bytes]`;
	}
	if (value.length > 1000) {
		return `${value.substring(0, 100)}... [${value.length} chars total]`;
	}
	return value;
}

// Функция для маскирования чувствительных данных в логах
function maskSensitiveData(obj: unknown): unknown {
	if (!obj || typeof obj !== "object") return obj;

	const masked: Record<string, unknown> | unknown[] = Array.isArray(obj) ? [...obj] : { ...(obj as Record<string, unknown>) };

	if (Array.isArray(masked)) {
		// Для массивов рекурсивно обработать элементы
		return masked.map((item) => (typeof item === "object" && item !== null ? maskSensitiveData(item) : item));
	}

	// Для объектов обработать каждый ключ
	for (const key in masked) {
		const value = masked[key];

		if (isSensitiveKey(key)) {
			masked[key] = "***";
		} else if (isLargeDataKey(key) && typeof value === "string" && value.length > 100) {
			masked[key] = `[${value.length} bytes]`;
		} else if (typeof value === "string") {
			masked[key] = maskStringValue(value);
		} else if (typeof value === "object" && value !== null) {
			masked[key] = maskSensitiveData(value);
		}
	}

	return masked;
}

// Security headers configuration
app.use(
		helmet({
			contentSecurityPolicy: {
				directives: {
					defaultSrc: ["'self'"],
					styleSrc: ["'self'", "'unsafe-inline'"],
					fontSrc: ["'self'"],
					imgSrc: ["'self'", "data:", "https:", "blob:"],
					scriptSrc: ["'self'", "https://mc.yandex.ru", "https://mc.yandex.com"],
					connectSrc: ["'self'", "wss:", "https:"],
					// blob: — для воспроизведения mic-check записи (createObjectURL)
					// blob: в imgSrc — для загрузки локальных изображений через canvas (gamification админка)
					// https://radio.voxlibris.ru — для воспроизведения Icecast потока слушателями
					mediaSrc: ["'self'", "blob:", "https://radio.voxlibris.ru"],
				frameSrc: ["'none'"],
				objectSrc: ["'none'"],
				baseUri: ["'self'"],
				formAction: ["'self'"],
			},
		},
		hsts: {
			maxAge: 31536000,
			includeSubDomains: true,
			preload: true,
		},
		noSniff: true,
		frameguard: { action: "deny" },
		xssFilter: true,
		referrerPolicy: { policy: "strict-origin-when-cross-origin" },
	}),
);

// CORS configuration for credentials
app.use(
	cors({
		origin: allowedOrigins,
		credentials: true,
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
		exposedHeaders: ["X-Total-Count"],
	}),
);

// Dynamic JSON/text compression for API responses.
app.use(responseCompression);

declare global {
	namespace Express {
		interface Request {
			_rateLimitUserKey?: string | null;
		}
	}
}

function parsePositiveIntEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
	const raw = process.env[name];
	if (!raw) return fallback;
	const normalized = raw.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return fallback;
}

function withRedisPasswordIfMissing(redisUrl: string, password: string): string {
	if (!password) {
		return redisUrl;
	}
	try {
		const parsed = new URL(redisUrl);
		if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
			return redisUrl;
		}
		if (parsed.password || parsed.username) {
			return redisUrl;
		}
		parsed.password = password;
		return parsed.toString();
	} catch {
		return redisUrl;
	}
}

function redactRedisUrl(redisUrl: string): string {
	try {
		const parsed = new URL(redisUrl);
		if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
			return "invalid-redis-url";
		}
		return `${parsed.protocol}//${parsed.host}`;
	} catch {
		return "invalid-redis-url";
	}
}

const isProduction = process.env.NODE_ENV === "production";
const redisPassword = process.env.REDIS_PASSWORD || (isProduction ? "" : "redis_dev");
const configuredRedisUrl = process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || "";
let redisUrl = "";
if (configuredRedisUrl) {
	redisUrl = withRedisPasswordIfMissing(configuredRedisUrl, redisPassword);
} else if (!isProduction) {
	redisUrl = `redis://:${encodeURIComponent(redisPassword)}@127.0.0.1:6379`;
}
const redisLogTarget = redisUrl ? redactRedisUrl(redisUrl) : "";
const redisEnabled = parseBooleanEnv(
	"RATE_LIMIT_REDIS_ENABLED",
	Boolean(redisUrl),
);
const redisPrefix = process.env.RATE_LIMIT_REDIS_PREFIX || "rl:voxlibris";

let createRedisStore: ((namespace: string) => RedisStore) | null = null;

if (redisEnabled && redisUrl) {
	const redisClient = createClient({ url: redisUrl });
	redisClient.on("error", (error) => {
		logger.warn({ error }, "[rate-limit] Redis client error");
	});
	try {
		await redisClient.connect();
		logger.info({ redisTarget: redisLogTarget }, "[rate-limit] Redis store connected");
	} catch (error) {
		logger.warn({ error, redisTarget: redisLogTarget }, "[rate-limit] Redis connect failed, using memory fallback");
	}

	createRedisStore = (namespace: string) =>
		new RedisStore({
			sendCommand: (...args: string[]) => redisClient.sendCommand(args),
			prefix: `${redisPrefix}:${namespace}:`,
		});
} else {
	logger.info("[rate-limit] Redis store disabled, using in-memory store");
}

const rateLimitCommonOptions = {
	passOnStoreError: true,
} as const;

const rateLimitHeadersOptions = {
	standardHeaders: true,
	legacyHeaders: false,
} as const;

function withRateLimitStore(namespace: string): { store?: RedisStore } {
	return createRedisStore ? { store: createRedisStore(namespace) } : {};
}

const readMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function isReadMethod(req: Request): boolean {
	return readMethods.has(req.method);
}

function getRequestPath(req: Request): string {
	const originalUrl = req.originalUrl || req.url || req.path;
	const queryIndex = originalUrl.indexOf("?");
	return queryIndex === -1 ? originalUrl : originalUrl.slice(0, queryIndex);
}

function isAuthPath(req: Request): boolean {
	return getRequestPath(req).startsWith("/api/auth");
}

function isHealthPath(req: Request): boolean {
	return getRequestPath(req) === "/api/health";
}

function isExpensivePath(req: Request): boolean {
	const path = getRequestPath(req);
	const { method } = req;
	if (!path.startsWith("/api/")) {
		return false;
	}
	if (path.includes("/upload")) {
		return true;
	}
	if (path.includes("/export")) {
		return true;
	}
	if (path.startsWith("/api/storage")) {
		return true;
	}
	if (path.startsWith("/api/recordings") && method !== "GET") {
		return true;
	}
	return false;
}

function getClientIpKey(req: Request): string {
	const ip = req.ip || req.socket.remoteAddress || "unknown";
	return ipKeyGenerator(ip);
}

function getAccessTokenFromRequest(req: Request): string | null {
	const tokenFromHeader = authService.extractTokenFromHeader(req.headers.authorization);
	if (tokenFromHeader) {
		return tokenFromHeader;
	}
	return typeof req.cookies?.accessToken === "string" ? req.cookies.accessToken : null;
}

function resolveAuthenticatedRateLimitKey(req: Request): string | null {
	const token = getAccessTokenFromRequest(req);
	if (!token) {
		return null;
	}
	const payload = authService.verifyAccessToken(token);
	if (!payload?.userId) {
		return null;
	}
	return `user:${payload.userId}`;
}

function getAuthenticatedRateLimitKey(req: Request): string | null {
	if (req._rateLimitUserKey !== undefined) {
		return req._rateLimitUserKey;
	}
	const resolved = resolveAuthenticatedRateLimitKey(req);
	req._rateLimitUserKey = resolved;
	return resolved;
}

function getAuthIdentifier(req: Request): string | null {
	if (!req.body || typeof req.body !== "object") {
		return null;
	}
	const body = req.body as Record<string, unknown>;
	const candidates = [body.email, body.username, body.emailOrUsername, body.login];
	for (const candidate of candidates) {
		if (typeof candidate === "string") {
			const normalized = candidate.trim().toLowerCase();
			if (normalized.length > 0) {
				return normalized.slice(0, 254);
			}
		}
	}
	return null;
}

function getResendConfirmationIdentifier(req: Request): string | null {
	if (!req.body || typeof req.body !== "object") {
		return null;
	}

	const userId = (req.body as Record<string, unknown>).userId;
	if (typeof userId !== "string") {
		return null;
	}

	const normalized = userId.trim().toLowerCase();
	return normalized.length > 0 ? normalized.slice(0, 128) : null;
}

function getAuthRateLimitKey(req: Request): string {
	const ipKey = getClientIpKey(req);
	const identifier = getAuthIdentifier(req);
	return identifier ? `auth:${identifier}:${ipKey}` : `auth:${ipKey}`;
}

function getResendConfirmationRateLimitKey(req: Request): string {
	const ipKey = getClientIpKey(req);
	const identifier = getResendConfirmationIdentifier(req);
	return identifier ? `resend:${identifier}:${ipKey}` : `resend:${ipKey}`;
}

function getGeneralRateLimitKey(req: Request): string {
	return getAuthenticatedRateLimitKey(req) ?? `ip:${getClientIpKey(req)}`;
}

function isAuthenticatedRequest(req: Request): boolean {
	return getAuthenticatedRateLimitKey(req) !== null;
}

// Rate limiting configuration
// Строгий rate limiting для auth endpoints
const authLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("auth-strict"),
	windowMs: 15 * 60 * 1000, // 15 минут
	max: 5, // максимум 5 попыток
	keyGenerator: getAuthRateLimitKey,
	message: {
		error: "Too many authentication attempts. Please try again later.",
		retryAfter: "15 minutes",
	},
	skipSuccessfulRequests: true,
});

const resendConfirmationWindowMs = parsePositiveIntEnv("RL_RESEND_CONFIRMATION_WINDOW_MS", 60 * 60 * 1000);
const resendConfirmationMax = parsePositiveIntEnv("RL_RESEND_CONFIRMATION_MAX", 3);

const resendConfirmationLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("auth-resend-confirmation"),
	windowMs: resendConfirmationWindowMs,
	max: resendConfirmationMax,
	keyGenerator: getResendConfirmationRateLimitKey,
	message: {
		error: "Too many confirmation email requests. Please try again later.",
		code: "RESEND_CONFIRMATION_LIMIT",
		retryAfter: `${Math.ceil(resendConfirmationWindowMs / 1000)} seconds`,
	},
});

// ============================================
// Guest System Rate Limiting
// ============================================

const guestInitWindowMs = parsePositiveIntEnv("RL_GUEST_INIT_WINDOW_MS", 15 * 60 * 1000);
const guestInitMax = parsePositiveIntEnv("RL_GUEST_INIT_MAX", 10);

// Guest init: 10 requests per 15 minutes
const guestInitLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("guest-init"),
	windowMs: guestInitWindowMs,
	max: guestInitMax,
	keyGenerator: getGeneralRateLimitKey,
	message: {
		error: "Too many guest accounts created. Please try again later.",
		code: "GUEST_INIT_LIMIT",
		retryAfter: `${Math.ceil(guestInitWindowMs / 1000)} seconds`,
	},
});

const guestRestoreWindowMs = parsePositiveIntEnv("RL_GUEST_RESTORE_WINDOW_MS", 5 * 60 * 1000);
const guestRestoreMax = parsePositiveIntEnv("RL_GUEST_RESTORE_MAX", 5);

// Guest restore: 5 attempts per 5 minutes with exponential backoff
const guestRestoreLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("guest-restore"),
	windowMs: guestRestoreWindowMs,
	max: guestRestoreMax,
	keyGenerator: getGeneralRateLimitKey,
	message: {
		error: "Too many restore attempts. Please try again later.",
		code: "GUEST_RESTORE_LIMIT",
		retryAfter: `${Math.ceil(guestRestoreWindowMs / 1000)} seconds`,
	},
});

const guestUploadWindowMs = parsePositiveIntEnv("RL_GUEST_UPLOAD_WINDOW_MS", 30 * 60 * 1000);
const guestUploadMax = parsePositiveIntEnv("RL_GUEST_UPLOAD_MAX", 3);

// Guest upload: 3 uploads per 30 minutes per IP
const guestUploadLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("guest-upload"),
	windowMs: guestUploadWindowMs,
	max: guestUploadMax,
	keyGenerator: getGeneralRateLimitKey,
	message: {
		error: "Too many uploads. Please try again later.",
		code: "GUEST_UPLOAD_LIMIT",
		retryAfter: `${Math.ceil(guestUploadWindowMs / 1000)} seconds`,
	},
});

const guestAnalyticsWindowMs = parsePositiveIntEnv("RL_GUEST_ANALYTICS_WINDOW_MS", 60 * 60 * 1000);
const guestAnalyticsMax = parsePositiveIntEnv("RL_GUEST_ANALYTICS_MAX", 100);

// Guest analytics: 100 events per hour, burst 20
const guestAnalyticsLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("guest-analytics"),
	windowMs: guestAnalyticsWindowMs,
	max: guestAnalyticsMax,
	keyGenerator: getGeneralRateLimitKey,
	message: {
		error: "Too many analytics events. Please slow down.",
		code: "GUEST_ANALYTICS_LIMIT",
		retryAfter: `${Math.ceil(guestAnalyticsWindowMs / 1000)} seconds`,
	},
});

const authSlowDownDelayAfter = parsePositiveIntEnv("RL_AUTH_DELAY_AFTER", 1000);
const authSlowDownWindowMs = parsePositiveIntEnv("RL_AUTH_DELAY_WINDOW_MS", 15 * 60 * 1000);

// Slow down brute-force bursts on auth endpoints
const speedLimiter = slowDown({
	...rateLimitCommonOptions,
	...withRateLimitStore("auth-slow"),
	windowMs: authSlowDownWindowMs,
	delayAfter: authSlowDownDelayAfter,
	keyGenerator: getAuthRateLimitKey,
	delayMs: (used, req) => {
		const delayAfter = req.slowDown.limit;
		return (used - delayAfter) * 500;
	},
	validate: { delayMs: false },
});

const anonBurstWindowMs = parsePositiveIntEnv("RL_ANON_BURST_WINDOW_MS", 5 * 1000);
const anonBurstMax = parsePositiveIntEnv("RL_ANON_BURST_MAX", 10);
const anonReadWindowMs = parsePositiveIntEnv("RL_ANON_READ_WINDOW_MS", 60 * 1000);
const anonReadMax = parsePositiveIntEnv("RL_ANON_READ_MAX", 120);
const anonWriteWindowMs = parsePositiveIntEnv("RL_ANON_WRITE_WINDOW_MS", 15 * 60 * 1000);
const anonWriteMax = parsePositiveIntEnv("RL_ANON_WRITE_MAX", 120);

const authReadWindowMs = parsePositiveIntEnv("RL_AUTH_READ_WINDOW_MS", 15 * 60 * 1000);
const authReadMax = parsePositiveIntEnv("RL_AUTH_READ_MAX", 1200);
const authWriteWindowMs = parsePositiveIntEnv("RL_AUTH_WRITE_WINDOW_MS", 15 * 60 * 1000);
const authWriteMax = parsePositiveIntEnv("RL_AUTH_WRITE_MAX", 300);
const expensiveWindowMs = parsePositiveIntEnv("RL_EXPENSIVE_WINDOW_MS", 15 * 60 * 1000);
const expensiveMax = parsePositiveIntEnv("RL_EXPENSIVE_MAX", 30);

const shouldSkipRiskLimiter = (req: Request) => isHealthPath(req) || isAuthPath(req);

// Anti-burst protection for unauthenticated traffic
const anonymousBurstLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("anon-burst"),
	windowMs: anonBurstWindowMs,
	max: anonBurstMax,
	keyGenerator: (req) => `anon-burst:${getClientIpKey(req)}`,
	skip: (req) => shouldSkipRiskLimiter(req) || isAuthenticatedRequest(req),
	message: {
		error: "Too many requests from this source. Please wait a few seconds.",
		retryAfter: `${Math.ceil(anonBurstWindowMs / 1000)} seconds`,
	},
});

// Sustained limiter for anonymous read traffic
const anonymousReadLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("anon-read"),
	windowMs: anonReadWindowMs,
	max: anonReadMax,
	keyGenerator: (req) => `anon-read:${getClientIpKey(req)}`,
	skip: (req) =>
		shouldSkipRiskLimiter(req) ||
		isAuthenticatedRequest(req) ||
		!isReadMethod(req) ||
		isExpensivePath(req),
	message: {
		error: "Too many requests. Please slow down.",
		retryAfter: `${Math.ceil(anonReadWindowMs / 1000)} seconds`,
	},
});

// Sustained limiter for anonymous mutations (non-auth endpoints only)
const anonymousWriteLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("anon-write"),
	windowMs: anonWriteWindowMs,
	max: anonWriteMax,
	keyGenerator: (req) => `anon-write:${getClientIpKey(req)}`,
	skip: (req) =>
		shouldSkipRiskLimiter(req) ||
		isAuthenticatedRequest(req) ||
		isReadMethod(req) ||
		isExpensivePath(req),
	message: {
		error: "Too many requests. Please slow down.",
		retryAfter: `${Math.ceil(anonWriteWindowMs / 1000)} seconds`,
	},
});

// Strict limiter for expensive operations (upload/export/storage)
const expensiveLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("expensive"),
	windowMs: expensiveWindowMs,
	max: expensiveMax,
	keyGenerator: getGeneralRateLimitKey,
	skip: (req) => shouldSkipRiskLimiter(req) || !isExpensivePath(req),
	message: {
		error: "Too many heavy requests. Please retry later.",
		retryAfter: `${Math.ceil(expensiveWindowMs / 1000)} seconds`,
	},
});

// Authenticated read traffic limiter
const authenticatedReadLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("auth-read"),
	windowMs: authReadWindowMs,
	max: authReadMax,
	keyGenerator: getGeneralRateLimitKey,
	skip: (req) =>
		shouldSkipRiskLimiter(req) ||
		!isAuthenticatedRequest(req) ||
		!isReadMethod(req) ||
		isExpensivePath(req),
	message: {
		error: "Too many requests. Please slow down.",
		retryAfter: `${Math.ceil(authReadWindowMs / 1000)} seconds`,
	},
});

// Authenticated write traffic limiter
const authenticatedWriteLimiter = rateLimit({
	...rateLimitCommonOptions,
	...rateLimitHeadersOptions,
	...withRateLimitStore("auth-write"),
	windowMs: authWriteWindowMs,
	max: authWriteMax,
	keyGenerator: getGeneralRateLimitKey,
	skip: (req) =>
		shouldSkipRiskLimiter(req) ||
		!isAuthenticatedRequest(req) ||
		isReadMethod(req) ||
		isExpensivePath(req),
	message: {
		error: "Too many requests. Please slow down.",
		retryAfter: `${Math.ceil(authWriteWindowMs / 1000)} seconds`,
	},
});

declare module "http" {
	interface IncomingMessage {
		rawBody: unknown;
	}
}

app.use(
	express.json({
		limit: process.env.JSON_BODY_LIMIT || "15mb",
		verify: (req, _res, buf) => {
			req.rawBody = buf;
		},
	}),
);

app.use(express.urlencoded({ extended: false, limit: process.env.URLENCODED_BODY_LIMIT || "1mb" }));

// Cookie parser для работы с JWT токенами в cookies
app.use(cookieParser());

// ===== Icecast Live Stream Proxy =====
// Проксируем /live/* запросы на Icecast для слушателей
// Это должно быть ПЕРЕД всеми другими middleware, чтобы не попадать в rate-limiting
app.get('/live/:sessionId', createIcecastLiveProxy());
app.head('/live/:sessionId', createIcecastLiveProxy());

// Setup JWT-based authentication routes
// Применить rate limiting middleware
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/auth/resend-confirmation", resendConfirmationLimiter);
app.use("/api/auth", speedLimiter);
// Studio stream — долгоживущий запрос, монтируем ДО rate-limiters для /api
	// Собственный rate-limit: 1 активный поток на пользователя обеспечивается
	// логикой сессии на уровне приложения (один reader_id = один mount point)
	app.use("/api/studio/stream", studioStreamRouter);

	app.use("/api", anonymousBurstLimiter);
app.use("/api", anonymousReadLimiter);
app.use("/api", anonymousWriteLimiter);
app.use("/api", expensiveLimiter);
app.use("/api", authenticatedReadLimiter);
app.use("/api", authenticatedWriteLimiter);

// Guest System Rate Limiting
app.use("/api/v1/guest/init", guestInitLimiter);
app.use("/api/v1/guest/restore", guestRestoreLimiter);
app.use("/api/v1/guest/books/upload", guestUploadLimiter);
app.use("/api/v1/guest/analytics", guestAnalyticsLimiter);

setupAuthRoutes(app);

// Guest System API (feature flag checked in middleware)
app.use("/api/v1/guest", guestRoutes);
logger.info("Guest routes mounted (controlled by feature flag in database)");

// Debug API (development only)
if (process.env.NODE_ENV !== "production") {
	app.use("/api/debug", debugRoutes);
}

// Periodic cleanup of expired refresh tokens (every hour)
	setInterval(
		async () => {
			try {
				await authService.cleanupExpiredTokens();
				await authService.cleanupExpiredPasswordResetTokens();
			} catch (error) {
				console.error("Failed to cleanup expired tokens:", error);
			}
		},
	60 * 60 * 1000,
); // 1 hour

// Setup WebSocket handlers for live reading
setupWebSocketHandlers(io);

// Initialize Reader WebSocket (JWT-based authentication)
initializeReaderWebSocket(httpServer);

// Initialize Club Chat WebSocket
initializeChatWebSocket(httpServer);

// Initialize DM real-time handlers
initializeDmHandlers(io);

// Initialize Reading Sessions WebSocket namespace
const readingSessionsNamespace = io.of('/reading-sessions');
setupReadingSessionsHandlers(io, readingSessionsNamespace);

app.use((req, res, next) => {
	const start = Date.now();
	const path = req.path;
	let capturedJsonResponse: Record<string, unknown> | undefined;

	const originalResJson = res.json;
	res.json = (bodyJson, ...args) => {
		capturedJsonResponse = bodyJson;
		return originalResJson.apply(res, [bodyJson, ...args]);
	};

	res.on("finish", () => {
			const duration = Date.now() - start;
			if (path.startsWith("/api")) {
				let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
				if (capturedJsonResponse) {
					const safeResponse = maskSensitiveData(capturedJsonResponse);
					if (Array.isArray(safeResponse)) {
						logLine += ` :: response=array(${safeResponse.length})`;
					} else if (typeof safeResponse === "object" && safeResponse !== null) {
						logLine += ` :: response=object(${Object.keys(safeResponse).length} keys)`;
					} else {
						logLine += ` :: response=${typeof safeResponse}`;
					}
				}

				log(logLine);
			}
	});

	next();
});

// Проверка окружения перед запуском
try {
	validateEnvironment();
	log("Environment validation passed");
} catch (error: unknown) {
	const errorMessage = formatUnknownError(error);
	console.error("Environment validation failed:", errorMessage);
	process.exit(1);
}

// Асинхронная инициализация
try {
	// Load feature flags from database
	// NOSONAR typescript:S7785 - await inside try-catch, not top-level
	await loadFeatureFlags();

	// Регистрация основных роутов
	await registerRoutes(httpServer, app);

	// Setup Admin routes
	app.use("/api/v1/admin", adminRoutes);

	// Setup Admin Guest routes
	const { default: adminGuestRoutes } = await import("./admin-guest-routes.js");
	app.use("/api/v1/admin", adminGuestRoutes);

	// Setup Admin Feature Flags routes
	const { default: adminFeatureFlagsRoutes } = await import("./admin-feature-flags.js");
	app.use("/api/v1/admin", adminFeatureFlagsRoutes);

	// Setup Analytics routes
	app.use("/api/v1/analytics", analyticsRoutes);

	// Setup Club routes (JWT применяется индивидуально в каждом роуте)
	app.use("/api/clubs", clubRoutes);

	// Setup Club Reader routes (JWT protected)
	app.use("/api/clubs", clubReaderRoutes);

	// Setup Reader routes (JWT protected)
	app.use("/api/v1/books", jwtAuth, readerRoutes);

	// Setup Reading Sessions routes (JWT protected)
	app.use("/api/reading-sessions", jwtAuth, readingSessionsRoutes);

	// Setup Reactions routes (JWT protected)
	app.use("/api/reactions", jwtAuth, reactionsRoutes);

	// Setup Reading Status routes (JWT protected)
	app.use("/api/reading-status", jwtAuth, readingStatusRoutes);

	// Setup Questions routes (JWT protected)
	app.use("/api/questions", jwtAuth, questionsRoutes);

	// Setup Schedule routes (JWT protected)
	app.use("/api/schedule", jwtAuth, scheduleRoutes);

	// Setup Feedback routes (no JWT required - public endpoint)
	app.use("/api/v1/feedback", feedbackRoutes);

	// Setup Social Graph routes (JWT protected)
	app.use("/api/social", jwtAuth, socialRoutes);

	// Setup Activity Feed routes (optionalJwtAuth — /activity/:userId публичен, остальные проверяют req.user сами)
	app.use("/api/feed", optionalJwtAuth, feedRoutes);

	// Setup Users search & public profiles (JWT optional — гости тоже могут искать)
	app.use("/api/users", usersRoutes);

	// Presence — онлайн-статус пользователей в клубах
	app.use("/api/presence", presenceRoutes);

	// Direct Messages
	app.use("/api/dm", jwtAuth, dmRoutes);

	// Gamification admin constructor
	app.use("/api/admin/gamification", jwtAuth, gamificationAdminRoutes);

	// Gamification user read API
	app.use("/api/gamification", jwtAuth, gamificationRoutes);

	// Start scheduler for notifications (only in production or if enabled)
	if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SCHEDULER === 'true') {
		scheduler.start();
	}

	// Error handling middleware
	app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
		const errorLike = err as { status?: number; statusCode?: number; message?: string };
		const status = errorLike.status ?? errorLike.statusCode ?? 500;
		const message = errorLike.message || "Internal Server Error";
		if (!res.headersSent) {
			res.status(status).json({ message });
		}

		logger.error(
			{
				status,
				error: err instanceof Error ? { message: err.message, stack: err.stack } : formatUnknownError(err),
			},
			"Unhandled request error",
		);
	});

	// Setup static serving for production
	if (process.env.NODE_ENV === "production") {
		serveStatic(app);
	} else {
		// In development, serve a simple backend info page instead of the full React app
		// Use a generic middleware (no route pattern strings) to avoid path-to-regexp issues
		app.use((req, res, next) => {
			// Skip API routes, websocket, and asset routes
			if (
				req.path.startsWith("/api") ||
				req.path.startsWith("/socket.io") ||
				req.path.startsWith("/vite-hmr") ||
				req.path.startsWith("/@") ||
				req.path.startsWith("/__vite")
			) {
				return next();
			}

			// Serve backend info page for all other routes
			res
				.status(200)
				.set({ "Content-Type": "text/html" })
				.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Voxlibris Platform Backend</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                   margin: 0; padding: 2rem; background: #f5f5f5; color: #333; }
            .container { max-width: 600px; margin: 0 auto; background: white;
                        padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .logo { color: #3b82f6; font-size: 2rem; font-weight: bold; margin-bottom: 1rem; }
            .status { color: #10b981; font-weight: 500; }
            .link { color: #3b82f6; text-decoration: none; font-weight: 500; }
            .link:hover { text-decoration: underline; }
            .info { background: #f8fafc; padding: 1rem; border-radius: 6px; margin: 1rem 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">📚 Voxlibris Platform</div>
            <h1>Backend Server</h1>
            <p class="status">✅ Backend сервер работает</p>
            <p>Это backend API сервер проекта Voxlibris Platform.</p>
            <div class="info">
              <strong>Для открытия интерфейса приложения перейдите на:</strong><br>
              <a href="http://localhost:3000" class="link">http://localhost:3000</a>
            </div>
            <h3>API Endpoints:</h3>
            <ul>
              <li><code>/api/auth/*</code> - Аутентификация</li>
              <li><code>/api/clubs/*</code> - Клубы чтения</li>
              <li><code>/api/books/*</code> - Книги и контент</li>
              <li><code>/socket.io</code> - WebSocket подключение</li>
            </ul>
            <p><small>Порт: ${port} | Env: ${process.env.NODE_ENV || "development"}</small></p>
          </div>
        </body>
        </html>
      `);
		});
	}

	// ALWAYS serve the app on the port specified in the environment variable PORT
	const port = Number.parseInt(process.env.PORT || "5000", 10);
	httpServer.listen(
		{
			port,
			host: "0.0.0.0",
			reusePort: true,
		},
		() => {
			log(`serving on port ${port}`);
		},
	);
} catch (error) {
	console.error("❌ Fatal error during server initialization:", error);
	process.exit(1);
}
