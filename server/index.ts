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
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import helmet from "helmet";
import { Server as SocketIOServer } from "socket.io";
import adminRoutes from "./admin-routes.js";
import analyticsRoutes from "./analytics-routes.js";
import { setupAuthRoutes } from "./auth-routes.js";
import { authService } from "./auth-service.js";
import clubReaderRoutes from "./club-reader-routes.js";
import clubRoutes from "./club-routes.js";
import { validateEnvironment } from "./config/validate.js";
import { jwtAuth } from "./jwt-middleware.js";
import { registerRoutes } from "./routes.js";
import readerRoutes from "./routes/reader.js";
import { serveStatic } from "./static.js";
import { setupWebSocketHandlers } from "./websocket.js";
import { initializeReaderWebSocket } from "./websocket-reader.js";
import { initializeChatWebSocket } from "./websocket-chat.js";
import { setupReadingSessionsHandlers } from "./websocket/reading-sessions.js";
import { scheduler } from "./services/scheduler.js";
import webrtcRoutes from "./routes/webrtc.js";
import readingSessionsRoutes from "./routes/reading-sessions.js";
import reactionsRoutes from "./routes/reactions.js";
import questionsRoutes from "./routes/questions.js";
import scheduleRoutes from "./routes/schedule.js";
import { logger } from "./lib/logger.js";

export const app = express();

// Trust proxy для корректной работы rate limiting за reverse proxy (CapRover/Traefik)
// trust proxy: 1 — trust only first hop, предотвращает spoofing от пользователей
app.set('trust proxy', 1);
const httpServer = createServer(app);

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

// Функция для маскирования чувствительных данных в логах
function maskSensitiveData(obj: unknown): unknown {
	if (!obj || typeof obj !== "object") return obj;

	const sensitiveKeys = [
		"password",
		"token",
		"secret",
		"apikey",
		"api_key",
		"accesstoken",
		"refreshtoken",
	];
	const masked: Record<string, unknown> | unknown[] = Array.isArray(obj) ? [...obj] : { ...(obj as Record<string, unknown>) };

	if (!Array.isArray(masked)) {
		for (const key in masked) {
			const lowerKey = key.toLowerCase();
			if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
				masked[key] = "***";
			} else if (typeof masked[key] === "object" && masked[key] !== null) {
				masked[key] = maskSensitiveData(masked[key]);
			}
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
				styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
				fontSrc: ["'self'", "https://fonts.gstatic.com"],
				imgSrc: ["'self'", "data:", "https:"],
				scriptSrc: ["'self'", "https://mc.yandex.ru", "https://mc.yandex.com"],
				connectSrc: ["'self'", "wss:", "https:"],
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

// Rate limiting configuration
// Строгий rate limiting для auth endpoints
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 минут
	max: 5, // максимум 5 попыток
	message: {
		error: "Too many authentication attempts. Please try again later.",
		retryAfter: "15 minutes",
	},
	standardHeaders: true,
	legacyHeaders: false,
	skipSuccessfulRequests: true,
});

// General rate limiting
const generalLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 500, // 500 запросов в 15 минут
	message: {
		error: "Too many requests. Please slow down.",
		retryAfter: "15 minutes",
	},
	standardHeaders: true,
	legacyHeaders: false,
});

// Slow down for repeated requests
const speedLimiter = slowDown({
	windowMs: 15 * 60 * 1000,
	delayAfter: 1000,
	delayMs: (used, req) => {
		const delayAfter = req.slowDown.limit;
		return (used - delayAfter) * 500;
	},
	validate: { delayMs: false },
});

declare module "http" {
	interface IncomingMessage {
		rawBody: unknown;
	}
}

app.use(
	express.json({
		limit: "50mb",
		verify: (req, _res, buf) => {
			req.rawBody = buf;
		},
	}),
);

app.use(express.urlencoded({ extended: false }));

// Cookie parser для работы с JWT токенами в cookies
app.use(cookieParser());

// Setup JWT-based authentication routes
// Применить rate limiting middleware
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/auth", speedLimiter);
app.use(generalLimiter);

setupAuthRoutes(app);

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
				logLine += ` :: ${JSON.stringify(safeResponse)}`;
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
	const errorMessage = error instanceof Error ? error.message : String(error);
	console.error("Environment validation failed:", errorMessage);
	process.exit(1);
}

// Асинхронная инициализация
try {
	// Регистрация основных роутов
	await registerRoutes(httpServer, app);

	// Setup Admin routes
	app.use("/api/v1/admin", adminRoutes);

	// Setup Analytics routes
	app.use("/api/v1/analytics", analyticsRoutes);

	// Setup Club routes (JWT применяется индивидуально в каждом роуте)
	app.use("/api/clubs", clubRoutes);

	// Setup Club Reader routes (JWT protected)
	app.use("/api/clubs", clubReaderRoutes);

	// Setup Reader routes (JWT protected)
	app.use("/api/v1/books", jwtAuth, readerRoutes);

	// Setup WebRTC routes (JWT protected)
	app.use("/api/webrtc", jwtAuth, webrtcRoutes);

	// Setup Reading Sessions routes (JWT protected)
	app.use("/api/reading-sessions", jwtAuth, readingSessionsRoutes);

	// Setup Reactions routes (JWT protected)
	app.use("/api/reactions", jwtAuth, reactionsRoutes);

	// Setup Questions routes (JWT protected)
	app.use("/api/questions", jwtAuth, questionsRoutes);

	// Setup Schedule routes (JWT protected)
	app.use("/api/schedule", jwtAuth, scheduleRoutes);

	// Start scheduler for notifications (only in production or if enabled)
	if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SCHEDULER === 'true') {
		scheduler.start();
	}

	// Error handling middleware
	app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
		const errorLike = err as { status?: number; statusCode?: number; message?: string };
		const status = errorLike.status ?? errorLike.statusCode ?? 500;
		const message = errorLike.message || "Internal Server Error";
		res.status(status).json({ message });
		throw err;
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
          <title>xLibris Backend</title>
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
            <div class="logo">📚 xLibris</div>
            <h1>Backend Server</h1>
            <p class="status">✅ Backend сервер работает</p>
            <p>Это backend API сервер проекта xLibris.</p>
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
