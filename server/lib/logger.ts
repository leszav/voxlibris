import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  transport: isProduction ? undefined : {
    target: 'pino/file',
    options: { destination: 1 },
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // hostname: undefined, // Раскомментируйте, чтобы отключить hostname в логах
  // base: { hostname: 'custom-hostname' }, // Или задайте кастомный hostname
});

export function logInfo(message: string, data?: Record<string, unknown>) {
  if (data) {
    logger.info(data, message);
  } else {
    logger.info(message);
  }
}

export function logError(message: string, error?: unknown) {
  if (error instanceof Error) {
    logger.error({ error: error.message, stack: error.stack }, message);
  } else {
    logger.error(message);
  }
}

export function logWarn(message: string, data?: Record<string, unknown>) {
  if (data) {
    logger.warn(data, message);
  } else {
    logger.warn(message);
  }
}

export function logDebug(message: string, data?: Record<string, unknown>) {
  if (data) {
    logger.debug(data, message);
  } else {
    logger.debug(message);
  }
}
