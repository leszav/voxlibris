# Middleware

## Обзор

Middleware в VoxLibris - это функции, которые выполняются во время запроса-ответа. Они могут получить доступ к объекту запроса (req), объекту ответа (res) и следующей функции middleware в цикле вызова. В этом разделе описаны основные промежуточные слои приложения.

## Структура файлов

Middleware находятся в директории `server/middleware/`:

```
server/middleware/
├── auth-middleware.ts
├── cors-middleware.ts
├── error-handler-middleware.ts
├── rate-limiter-middleware.ts
├── logger-middleware.ts
├── validator-middleware.ts
├── file-upload-middleware.ts
└── content-security-middleware.ts
```

## Authentication Middleware

### server/middleware/auth-middleware.ts

Проверяет JWT-токен пользователя и добавляет информацию о пользователе к запросу:

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '@shared/types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number; role: string };
    req.user = { id: decoded.userId, role: decoded.role }; // добавляем пользователя к запросу
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token.' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    
    next();
  };
};
```

## CORS Middleware

### server/middleware/cors-middleware.ts

Настройка политики CORS для безопасности:

```typescript
import cors from 'cors';

const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? [process.env.FRONTEND_URL!] 
  : ['http://localhost:3000', 'http://localhost:3001'];

export const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  optionsSuccessStatus: 200
};

export default cors(corsOptions);
```

## Error Handler Middleware

### server/middleware/error-handler-middleware.ts

Обработка ошибок на уровне приложения:

```typescript
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(err);

  // Ошибки валидации Zod
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors
    });
  }

  // Ошибки аутентификации
  if (err.status === 401) {
    return res.status(401).json({ error: err.message || 'Unauthorized' });
  }

  // Ошибки авторизации
  if (err.status === 403) {
    return res.status(403).json({ error: err.message || 'Forbidden' });
  }

  // Ошибки ресурса не найден
  if (err.status === 404) {
    return res.status(404).json({ error: err.message || 'Not Found' });
  }

  // Ошибки бизнес-логики
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  // Необработанные ошибки
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
};
```

## Rate Limiter Middleware

### server/middleware/rate-limiter-middleware.ts

Ограничение частоты запросов для защиты от DDoS-атак:

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.connect().catch(console.error);

export const rateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  }),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS!) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX!) || 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: {
    error: 'Too many login attempts, please try again later.'
  },
  skipSuccessfulRequests: true
});
```

## Logger Middleware

### server/middleware/logger-middleware.ts

Логирование HTTP-запросов:

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });

  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body && Object.keys(req.body).length > 0 ? '[filtered]' : undefined
  });

  next();
};
```

## Validator Middleware

### server/middleware/validator-middleware.ts

Валидация входных данных с использованием Zod:

```typescript
import { Request, Response, NextFunction } from 'express';
import { AnyZodObject } from 'zod';

export const validate = (schema: AnyZodObject) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      });
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Пример использования:
import { z } from 'zod';

const createClubSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    isPublic: z.boolean().optional(),
  })
});

// В маршрутах:
router.post('/', validate(createClubSchema), async (req, res) => {
  // ...
});
```

## File Upload Middleware

### server/middleware/file-upload-middleware.ts

Обработка загрузки файлов (книг, обложек):

```typescript
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { BadRequestError } from '../errors';

const mkdirAsync = promisify(fs.mkdir);

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Определение типа файла по MIME
    let uploadPath = 'uploads/temp/';
    
    if (file.mimetype.startsWith('image/')) {
      uploadPath = 'storage/covers/';
    } else if (file.mimetype === 'application/epub+zip' || 
               file.mimetype === 'application/fb2' || 
               file.mimetype === 'text/xml') {
      uploadPath = 'storage/books/';
    }
    
    // Создание директории при необходимости
    if (!fs.existsSync(uploadPath)) {
      await mkdirAsync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Генерация уникального имени файла
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Фильтрация файлов
const fileFilter = (req: any, file: any, cb: any) => {
  // Проверка расширений
  const allowedExtensions = ['.epub', '.fb2', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new BadRequestError(`Invalid file type: ${ext}. Allowed types: ${allowedExtensions.join(', ')}`), false);
  }
};

export const upload = multer({ 
  storage, 
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1 // Только один файл за раз
  }
});
```

## Content Security Middleware

### server/middleware/content-security-middleware.ts

Повышение безопасности приложения:

```typescript
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "*.amazonaws.com"], // для S3
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "*.amazonaws.com", "ws:", "wss:"], // для WebSocket и S3
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  }
});

export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Очистка потенциально опасных данных
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  
  next();
};

const sanitizeObject = (obj: any) => {
  if (typeof obj === 'string') {
    // Удаление потенциально опасных тегов
    return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  } else if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  } else if (typeof obj === 'object' && obj !== null) {
    const sanitized: any = {};
    for (const key in obj) {
      sanitized[key] = sanitizeObject(obj[key]);
    }
    return sanitized;
  }
  return obj;
};
```

## Использование Middleware

В основном файле сервера (обычно `server/index.ts`) middleware регистрируются в определенном порядке:

```typescript
import express from 'express';
import corsMiddleware from './middleware/cors-middleware';
import { requestLogger } from './middleware/logger-middleware';
import { securityMiddleware, sanitizeInput } from './middleware/content-security-middleware';
import { rateLimiter } from './middleware/rate-limiter-middleware';
import { errorHandler } from './middleware/error-handler-middleware';

const app = express();

// Middleware в порядке важности
app.use(securityMiddleware);           // Защита
app.use(corsMiddleware);              // CORS
app.use(requestLogger);               // Логирование
app.use(rateLimiter);                 // Ограничение запросов
app.use(express.json());              // Парсинг JSON
app.use(sanitizeInput);               // Санитизация входных данных

// Основные маршруты
app.use('/api', routes);

// Обработчик ошибок (всегда последним)
app.use(errorHandler);
```

## Рекомендации

1. Регистрируйте middleware в правильном порядке (безопасность, логирование, парсинг и т.д.)
2. Пишите middleware функции сфокусированными на одной задаче
3. Используйте готовые решения (например, helmet, cors) вместо самописных
4. Обрабатывайте ошибки внутри middleware корректно
5. Используйте типизацию TypeScript для req, res, next
6. Избегайте блокировки event loop в middleware
7. Используйте асинхронные операции с правильной обработкой ошибок
8. Обновляйте документацию при изменении middleware