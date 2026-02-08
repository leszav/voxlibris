interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  MASTER_KEY: string;
  ALLOWED_ORIGINS?: string;
  PORT?: number;
}

export function validateEnvironment(): EnvConfig {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'MASTER_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const nodeEnv = process.env.NODE_ENV;
  const resolvedEnv: EnvConfig['NODE_ENV'] =
    nodeEnv === 'production' || nodeEnv === 'test' ? nodeEnv : 'development';

  const config: EnvConfig = {
    NODE_ENV: resolvedEnv,
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_SECRET: process.env.JWT_SECRET!,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
    MASTER_KEY: process.env.MASTER_KEY!,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    PORT: Number.parseInt(process.env.PORT || '5000', 10)
  };

  // Дополнительная валидация
  if (config.NODE_ENV === 'production' && config.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }

  if (config.MASTER_KEY.length !== 64) {
    throw new Error('MASTER_KEY must be exactly 64 hex characters (32 bytes)');
  }

  return config;
}
