import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/index.js';
import { AppError, ERR } from '../utils/errors.js';

export async function globalIpWhitelist(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (config.ipWhitelist.length === 0) return;

  const clientIp = request.ip;
  if (!config.ipWhitelist.includes(clientIp)) {
    throw new AppError('IP not allowed', ERR.IP_BLOCKED, 403);
  }
}
