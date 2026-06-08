import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

/** Cari folder yang berisi package.json (tahan PM2 cwd aneh). */
function resolveProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const root = resolveProjectRoot();
dotenv.config({ path: path.join(root, '.env') });

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  host: process.env.HOST ?? '0.0.0.0',
  port: parseInt(process.env.PORT ?? '3000', 10),
  baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
  },

  apiKey: {
    prefix: process.env.API_KEY_PREFIX ?? '',
    maxLength: Math.min(
      Math.max(parseInt(process.env.API_KEY_MAX_LENGTH ?? '15', 10), 8),
      15,
    ),
  },
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  },

  ipWhitelist: (process.env.IP_WHITELIST ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),

  database: {
    driver: (process.env.DB_DRIVER ?? 'sqlite') as 'sqlite' | 'mysql',
    path: path.resolve(root, process.env.DATABASE_PATH ?? 'storage/database.sqlite'),
    mysql: {
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: parseInt(process.env.MYSQL_PORT ?? '3306', 10),
      user: process.env.MYSQL_USER ?? 'root',
      password: process.env.MYSQL_PASSWORD ?? '',
      database: process.env.MYSQL_DATABASE ?? 'whatsapp_service',
    },
  },

  whatsapp: {
    authPath: path.resolve(root, process.env.AUTH_STORAGE_PATH ?? 'storage/auth'),
    maxSessions: parseInt(process.env.MAX_SESSIONS ?? '10', 10),
    reconnectIntervalMs: parseInt(process.env.RECONNECT_INTERVAL_MS ?? '5000', 10),
    maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS ?? '15', 10),
  },

  queue: {
    delayMinMs: parseInt(process.env.QUEUE_DELAY_MIN_MS ?? '3000', 10),
    delayMaxMs: parseInt(process.env.QUEUE_DELAY_MAX_MS ?? '8000', 10),
    cooldownMs: parseInt(process.env.QUEUE_COOLDOWN_MS ?? '5000', 10),
    maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES ?? '3', 10),
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY ?? '2', 10),
  },

  webhook: {
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS ?? '10000', 10),
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES ?? '3', 10),
  },

  log: {
    level: process.env.LOG_LEVEL ?? 'info',
    dir: path.resolve(root, process.env.LOG_DIR ?? 'logs'),
    rotateSize: process.env.LOG_ROTATE_SIZE ?? '10m',
    rotateInterval: process.env.LOG_ROTATE_INTERVAL ?? '1d',
    retainDays: parseInt(process.env.LOG_RETAIN_DAYS ?? '14', 10),
  },

  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED !== 'false',
  },

  admin: {
    email: (process.env.ADMIN_EMAIL ?? 'admin@localhost').trim(),
    phone: (process.env.ADMIN_PHONE ?? '').trim() || null,
    password: (process.env.ADMIN_PASSWORD ?? 'changeme123').trim(),
    name: (process.env.ADMIN_NAME ?? 'Super Admin').trim(),
  },

  cors: {
    origin: process.env.CORS_ORIGIN ?? '*',
  },
} as const;
