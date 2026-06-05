import type { FastifyInstance } from 'fastify';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { sessionRoutes } from '../modules/sessions/session.routes.js';
import { messageRoutes } from '../modules/messaging/message.routes.js';
import { healthRoutes } from '../modules/health/health.routes.js';
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request, reply) => {
    return reply.redirect('/dashboard');
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(sessionRoutes);
  await app.register(messageRoutes);
  await app.register(dashboardRoutes);
}
