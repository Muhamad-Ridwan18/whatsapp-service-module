import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { sessionManager } from '../../services/whatsapp/session-manager.js';
import { messageQueue } from '../../services/queue/message-queue.js';
import { sessionRepository } from '../../services/database/repositories/session.repository.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', {
    schema: { tags: ['Health'] },
  }, async (_request, reply) => {
    const mem = process.memoryUsage();
    const cpus = os.loadavg();

    return reply.send({
      status: 'ok',
      memory: {
        rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
      },
      cpu: {
        load1m: cpus[0]?.toFixed(2),
        load5m: cpus[1]?.toFixed(2),
        cores: os.cpus().length,
      },
      uptime: `${Math.floor(process.uptime())}s`,
      sessions: sessionManager.listSessions(),
      stats: {
        total: sessionRepository.count(),
        connected: sessionManager.getConnectedCount(),
        queue: messageQueue.getStats(),
      },
    });
  });
}
