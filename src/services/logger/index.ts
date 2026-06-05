import fs from 'node:fs';
import pino from 'pino';
import { config } from '../../config/index.js';

if (!fs.existsSync(config.log.dir)) {
  fs.mkdirSync(config.log.dir, { recursive: true });
}

const targets: pino.TransportTargetOptions[] = [];

if (!config.isProd) {
  targets.push({
    target: 'pino-pretty',
    level: config.log.level,
    options: { colorize: true, translateTime: 'SYS:standard' },
  });
}

targets.push({
  target: 'pino/file',
  level: config.log.level,
  options: { destination: `${config.log.dir}/app.log`, mkdir: true },
});

export const logger = pino({
  level: config.log.level,
  transport: { targets },
});

export const requestLogger = logger.child({ module: 'request' });
export const authLogger = logger.child({ module: 'auth' });
export const messageLogger = logger.child({ module: 'message' });
export const webhookLogger = logger.child({ module: 'webhook' });
export const waLogger = logger.child({ module: 'whatsapp' });
