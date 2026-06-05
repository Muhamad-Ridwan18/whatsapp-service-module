import type { FastifyReply, FastifyRequest } from 'fastify';
import { auditRepository } from '../services/database/repositories/audit.repository.js';

export async function auditMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!request.authUser) return;

  auditRepository.log({
    user_id: request.authUser.sub,
    action: 'user.request',
    resource: request.url,
    ip_address: request.ip,
    user_agent: request.headers['user-agent'],
  });
}
