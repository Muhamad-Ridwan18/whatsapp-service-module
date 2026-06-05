import type { FastifyReply, FastifyRequest } from 'fastify';
import { apiKeyRepository } from '../services/database/repositories/api-key.repository.js';
import { auditRepository } from '../services/database/repositories/audit.repository.js';
import { authLogger } from '../services/logger/index.js';
import type { ApiKeyRow, JwtPayload, UserRole } from '../types/index.js';
import { AppError, ERR } from '../utils/errors.js';
import { hashApiKey } from '../utils/crypto.js';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: JwtPayload;
    apiKey?: ApiKeyRow;
  }
}

export async function jwtAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    const payload = await request.jwtVerify<JwtPayload>();
    request.authUser = payload;
  } catch {
    throw new AppError('Unauthorized', ERR.UNAUTHORIZED, 401);
  }
}

export async function apiKeyAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('API key required', ERR.UNAUTHORIZED, 401);
  }

  const key = header.slice(7).trim();
  const keyHash = hashApiKey(key);
  const apiKey = apiKeyRepository.findByHash(keyHash);

  if (!apiKey) {
    authLogger.warn({ ip: request.ip }, 'Invalid API key');
    throw new AppError('Invalid API key', ERR.UNAUTHORIZED, 401);
  }

  if (apiKey.ip_whitelist) {
    const allowed = apiKey.ip_whitelist.split(',').map((ip) => ip.trim());
    const clientIp = request.ip;
    if (!allowed.includes(clientIp)) {
      throw new AppError('IP not whitelisted', ERR.IP_BLOCKED, 403);
    }
  }

  apiKeyRepository.updateLastUsed(apiKey.id);
  request.apiKey = apiKey;

  auditRepository.log({
    api_key_id: apiKey.id,
    action: 'api.request',
    resource: request.url,
    ip_address: request.ip,
    user_agent: request.headers['user-agent'],
  });
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.authUser || !roles.includes(request.authUser.role)) {
      throw new AppError('Forbidden', ERR.FORBIDDEN, 403);
    }
  };
}

export function requirePermission(permission: string) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const perms = request.apiKey
      ? (JSON.parse(request.apiKey.permissions) as string[])
      : ['*'];

    if (!perms.includes('*') && !perms.includes(permission)) {
      throw new AppError('Permission denied', ERR.FORBIDDEN, 403);
    }
  };
}
