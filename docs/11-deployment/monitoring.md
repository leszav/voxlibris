# Мониторинг

## Обзор

В этом разделе описаны инструменты и практики мониторинга приложения VoxLibris. Мониторинг позволяет отслеживать состояние системы, производительность, ошибки и пользовательскую активность.

## Структура файлов

Конфигурационные файлы мониторинга находятся в следующих директориях:

```
/
├── server/
│   ├── monitoring/
│   │   ├── metrics.ts
│   │   ├── logger.ts
│   │   ├── health-check.ts
│   │   └── performance.ts
│   └── middleware/
│       └── monitoring-middleware.ts
├── docker/
│   └── grafana/
│       ├── dashboards/
│       └── datasources/
└── .prometheus.yml
```

## Логирование

### server/monitoring/logger.ts

Файл `logger.ts` настраивает централизованное логирование:

```typescript
import winston from 'winston';
import { config } from '../config/config';

// Формат логов
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Транспорты для логов
const transports = [
  new winston.transports.File({ 
    filename: 'logs/error.log', 
    level: 'error',
    format: logFormat
  }),
  new winston.transports.File({ 
    filename: 'logs/combined.log', 
    format: logFormat
  })
];

// В разработке также выводим в консоль
if (config.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  );
}

// Создание логгера
export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: logFormat,
  transports,
});

// Типы логов
export interface LogMeta {
  userId?: number;
  sessionId?: number;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  additionalData?: Record<string, any>;
}

// Расширенные методы логирования
export const logInfo = (message: string, meta?: LogMeta) => {
  logger.info(message, { ...meta, timestamp: new Date().toISOString() });
};

export const logError = (message: string, error?: Error, meta?: LogMeta) => {
  logger.error(message, { 
    error: error?.stack || error?.message, 
    ...meta, 
    timestamp: new Date().toISOString() 
  });
};

export const logWarn = (message: string, meta?: LogMeta) => {
  logger.warn(message, { ...meta, timestamp: new Date().toISOString() });
};

export const logDebug = (message: string, meta?: LogMeta) => {
  logger.debug(message, { ...meta, timestamp: new Date().toISOString() });
};
```

## Метрики

### server/monitoring/metrics.ts

Файл `metrics.ts` настраивает сбор метрик с помощью Prometheus:

```typescript
import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Регистрация метрик
export const register = new client.Registry();

// Сбор стандартных метрик
client.collectDefaultMetrics({
  register,
  prefix: 'voxlibris_',
});

// Кастомные метрики
export const httpRequestDurationHistogram = new client.Histogram({
  name: 'voxlibris_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: 'voxlibris_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const activeUsersGauge = new client.Gauge({
  name: 'voxlibris_active_users',
  help: 'Number of currently active users',
  registers: [register],
});

export const activeSessionsGauge = new client.Gauge({
  name: 'voxlibris_active_reading_sessions',
  help: 'Number of currently active reading sessions',
  registers: [register],
});

export const booksUploadedCounter = new client.Counter({
  name: 'voxlibris_books_uploaded_total',
  help: 'Total number of uploaded books',
  registers: [register],
});

export const readingTimeHistogram = new client.Histogram({
  name: 'voxlibris_reading_time_seconds',
  help: 'Time spent reading books in seconds',
  buckets: [60, 300, 600, 1800, 3600, 7200],
  registers: [register],
});

// Регистрация метрик
register.registerMetric(httpRequestDurationHistogram);
register.registerMetric(httpRequestTotal);
register.registerMetric(activeUsersGauge);
register.registerMetric(activeSessionsGauge);
register.registerMetric(booksUploadedCounter);
register.registerMetric(readingTimeHistogram);
```

## Health Checks

### server/monitoring/health-check.ts

Файл `health-check.ts` реализует проверки состояния системы:

```typescript
import { Request, Response } from 'express';
import { db } from '../database/client';
import { getS3Config } from '../config/environment';
import { S3Client } from '@aws-sdk/client-s3';

// Проверка состояния базы данных
async function checkDatabase() {
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok', timestamp: new Date().toISOString() };
  } catch (error) {
    return { status: 'error', error: (error as Error).message, timestamp: new Date().toISOString() };
  }
}

// Проверка состояния S3 хранилища
async function checkS3Storage() {
  try {
    const s3Config = getS3Config();
    const s3Client = new S3Client({
      endpoint: s3Config.endpoint,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
      region: s3Config.region,
    });

    // Проверяем возможность доступа к бакету
    // Реализация зависит от конкретного способа проверки
    return { status: 'ok', timestamp: new Date().toISOString() };
  } catch (error) {
    return { status: 'error', error: (error as Error).message, timestamp: new Date().toISOString() };
  }
}

// Проверка основных компонентов системы
export async function healthCheck(req: Request, res: Response) {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkS3Storage(),
  ]);

  const results = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: checks[0],
      s3Storage: checks[1],
    },
    overall: checks.every(check => check.status === 'fulfilled' && check.value.status === 'ok') ? 'healthy' : 'unhealthy',
  };

  res.status(results.overall === 'healthy' ? 200 : 503).json(results);
}

// Проверка готовности приложения к работе
export async function readinessCheck(req: Request, res: Response) {
  // Здесь можно добавить проверки, которые показывают,
  // готово ли приложение принимать запросы
  const isReady = true; // Пока просто возвращаем true

  if (isReady) {
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } else {
    res.status(503).json({ status: 'not_ready', timestamp: new Date().toISOString() });
  }
}

// Проверка живости приложения
export async function livenessCheck(req: Request, res: Response) {
  // Здесь можно добавить проверки, которые показывают,
  // живо ли приложение (базово - просто ответ)
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
}
```

## Performance Monitoring

### server/monitoring/performance.ts

Файл `performance.ts` содержит инструменты для мониторинга производительности:

```typescript
import { logInfo, logWarn } from './logger';
import { httpRequestDurationHistogram, httpRequestTotal } from './metrics';

// Функция для измерения времени выполнения
export function measurePerformance<T>(
  fn: () => T,
  metricName: string,
  labels?: Record<string, string>
): T {
  const start = process.hrtime.bigint();
  try {
    const result = fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e9; // в секундах
    
    logInfo(`Performance measurement for ${metricName}`, {
      duration: `${duration}s`,
      ...labels
    });
    
    return result;
  } catch (error) {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e9;
    
    logWarn(`Performance measurement error for ${metricName}`, {
      duration: `${duration}s`,
      error: (error as Error).message,
      ...labels
    });
    
    throw error;
  }
}

// Асинхронная версия
export async function measureAsyncPerformance<T>(
  fn: () => Promise<T>,
  metricName: string,
  labels?: Record<string, string>
): Promise<T> {
  const start = process.hrtime.bigint();
  try {
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e9; // в секундах
    
    logInfo(`Async performance measurement for ${metricName}`, {
      duration: `${duration}s`,
      ...labels
    });
    
    return result;
  } catch (error) {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e9;
    
    logWarn(`Async performance measurement error for ${metricName}`, {
      duration: `${duration}s`,
      error: (error as Error).message,
      ...labels
    });
    
    throw error;
  }
}

// Middleware для измерения времени выполнения HTTP-запросов
export function performanceMonitoring() {
  return (req: any, res: any, next: any) => {
    const start = process.hrtime.bigint();
    
    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1e9; // в секундах
      
      // Обновляем метрики
      httpRequestDurationHistogram
        .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
        .observe(duration);
      
      httpRequestTotal
        .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
        .inc();
      
      // Логируем медленные запросы
      if (duration > 1) { // больше 1 секунды
        logWarn('Slow HTTP request detected', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}s`,
          ip: req.ip,
        });
      }
    });
    
    next();
  };
}
```

## Middleware для мониторинга

### server/middleware/monitoring-middleware.ts

Файл `monitoring-middleware.ts` содержит middleware для мониторинга:

```typescript
import { Request, Response, NextFunction } from 'express';
import { logInfo, logError, LogMeta } from '../monitoring/logger';
import { activeUsersGauge } from '../monitoring/metrics';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = Math.random().toString(36).substring(2, 15);
  const meta: LogMeta = {
    requestId,
    ip: req.ip,
    userAgent: req.get('User-Agent') || '',
  };

  logInfo(`Incoming request: ${req.method} ${req.path}`, meta);

  // Добавляем requestId к запросу для дальнейшего использования
  (req as any).requestId = requestId;

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logInfo(`Request completed: ${req.method} ${req.path}`, {
      ...meta,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
}

export function errorLogger(err: any, req: Request, res: Response, next: NextFunction) {
  logError(`Unhandled error: ${err.message}`, err, {
    requestId: (req as any).requestId,
    ip: req.ip,
    url: req.url,
    method: req.method,
  });

  next(err);
}

export function activeUsersTracker(req: Request, res: Response, next: NextFunction) {
  // Простой пример отслеживания активных пользователей
  // В реальном приложении это может быть более сложной логикой
  if (req.user) {
    activeUsersGauge.inc();
    
    res.on('finish', () => {
      activeUsersGauge.dec();
    });
  }
  
  next();
}
```

## Мониторинг с помощью Docker и Grafana

### docker/grafana/dashboards/voxlibris-dashboard.json

Пример конфигурации дашборда Grafana:

```json
{
  "dashboard": {
    "id": null,
    "title": "VoxLibris Application Dashboard",
    "tags": ["voxlibris", "nodejs", "express"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "HTTP Request Duration",
        "type": "graph",
        "targets": [
          {
            "expr": "voxlibris_http_request_duration_seconds_bucket",
            "legendFormat": "{{le}}"
          }
        ],
        "yAxes": [
          {
            "label": "Seconds"
          }
        ]
      },
      {
        "id": 2,
        "title": "Active Users",
        "type": "singlestat",
        "targets": [
          {
            "expr": "voxlibris_active_users",
            "legendFormat": "Active Users"
          }
        ]
      },
      {
        "id": 3,
        "title": "Active Reading Sessions",
        "type": "singlestat",
        "targets": [
          {
            "expr": "voxlibris_active_reading_sessions",
            "legendFormat": "Active Sessions"
          }
        ]
      },
      {
        "id": 4,
        "title": "HTTP Requests Total",
        "type": "graph",
        "targets": [
          {
            "expr": "increase(voxlibris_http_requests_total[5m])",
            "legendFormat": "{{method}} {{route}} {{status_code}}"
          }
        ]
      }
    ],
    "time": {
      "from": "now-6h",
      "to": "now"
    },
    "refresh": "5s"
  }
}
```

### prometheus.yml

Конфигурационный файл Prometheus:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'voxlibris'
    static_configs:
      - targets: ['localhost:5000']
    metrics_path: '/metrics'
    scrape_interval: 5s
```

## Алертинг

Для настройки алертов можно использовать Alertmanager с Prometheus:

```
# alert.rules.yml
groups:
  - name: voxlibris_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(voxlibris_http_requests_total{status_code=~"5.."}[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "More than 10% errors in the last 5 minutes"
      
      - alert: SlowResponseTime
        expr: histogram_quantile(0.95, rate(voxlibris_http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow response time detected"
          description: "95th percentile response time is above 2 seconds"
```

## Рекомендации

1. Ведите логирование на разных уровнях (info, warn, error, debug)
2. Используйте структурированные логи в формате JSON
3. Собирайте метрики производительности и бизнес-метрики
4. Настройте health checks для мониторинга состояния системы
5. Используйте распределенный трейсинг для сложных запросов
6. Настройте алертинг для критических ситуаций
7. Регулярно анализируйте логи и метрики
8. Используйте внешние сервисы мониторинга (New Relic, DataDog) при необходимости
9. Документируйте метрики и их значения
10. Обеспечьте защиту endpoint'ов с метриками от несанкционированного доступа