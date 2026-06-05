import { config } from './config/index.js';
import { buildApp } from './app.js';
import { db } from './services/database/index.js';
import { bootstrap } from './services/bootstrap.js';
import { sessionManager } from './services/whatsapp/session-manager.js';
import { logger } from './services/logger/index.js';

async function start(): Promise<void> {
  db.connect();
  await bootstrap();

  const app = await buildApp();

  await app.listen({ host: config.host, port: config.port });
  logger.info({ port: config.port, env: config.env }, 'Server started');

  if (typeof process.send === 'function') {
    process.send('ready');
  }

  await sessionManager.restoreAll();
  logger.info('All sessions restore initiated');
}

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down');
  db.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
