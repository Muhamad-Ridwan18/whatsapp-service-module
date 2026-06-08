import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { apiKeyRepository } from '../../services/database/repositories/api-key.repository.js';
import { auditRepository } from '../../services/database/repositories/audit.repository.js';
import { messageRepository } from '../../services/database/repositories/message.repository.js';
import { sessionEventRepository } from '../../services/database/repositories/session-event.repository.js';
import { sessionRepository } from '../../services/database/repositories/session.repository.js';
import { userRepository } from '../../services/database/repositories/user.repository.js';
import { messageQueue } from '../../services/queue/message-queue.js';
import { sessionManager } from '../../services/whatsapp/session-manager.js';
import type { JwtPayload, UserRole } from '../../types/index.js';
import { AppError, ERR } from '../../utils/errors.js';
import { auditActionLabel, sessionStatusLabel } from '../../utils/labels.js';

export async function verifyDashboardCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  app: FastifyInstance,
): Promise<boolean> {
  const token = request.cookies.token;
  if (!token) {
    reply.redirect('/login');
    return false;
  }
  try {
    request.authUser = await app.jwt.verify<JwtPayload>(token);
    return true;
  } catch {
    reply.clearCookie('token', { path: '/' });
    reply.redirect('/login');
    return false;
  }
}

export function verifyWsCookie(
  request: FastifyRequest,
  app: FastifyInstance,
): JwtPayload | null {
  const raw = request.headers.cookie ?? '';
  const match = raw.match(/(?:^|;\s*)token=([^;]+)/);
  if (!match?.[1]) return null;
  try {
    return app.jwt.verify<JwtPayload>(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function requireDashboardRole(
  request: FastifyRequest,
  ...roles: UserRole[]
): void {
  if (!request.authUser || !roles.includes(request.authUser.role)) {
    throw new AppError('Forbidden', ERR.FORBIDDEN, 403);
  }
}

export function isDashboardAdmin(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin';
}

export function canDashboardAccessSession(
  authUser: JwtPayload,
  session: { user_id: number | null } | undefined,
): boolean {
  if (!session) return false;
  if (isDashboardAdmin(authUser.role)) return true;
  return session.user_id === authUser.sub;
}

export async function assertDashboardSessionAccess(
  authUser: JwtPayload,
  sessionId: string,
) {
  const session = await sessionRepository.findBySessionId(sessionId);
  if (!session) {
    throw new AppError('Session tidak ditemukan', ERR.SESSION_NOT_FOUND, 404);
  }
  if (!canDashboardAccessSession(authUser, session)) {
    throw new AppError(
      'Session ini bukan milik akun Anda. Hubungi admin untuk nomor yang sama.',
      ERR.FORBIDDEN,
      403,
    );
  }
  return session;
}

export async function getSessionsForUser(userId: number, role: UserRole) {
  if (isDashboardAdmin(role)) {
    return sessionRepository.list();
  }
  return sessionRepository.listByUserId(userId);
}

export async function getDashboardContext(
  authUser: JwtPayload,
  extras?: Record<string, unknown>,
) {
  const sessions = await getSessionsForUser(authUser.sub, authUser.role);
  const apiKeys =
    authUser.role === 'super_admin'
      ? await apiKeyRepository.listAll()
      : await apiKeyRepository.findByUserId(authUser.sub);

  return {
    currentUser: {
      id: authUser.sub,
      email: authUser.email,
      role: authUser.role,
    },
    scanSession: null,
    newApiKey: null,
    errorMessage: null,
    successMessage: null,
    phoneHint: null,
    apiKeys: apiKeys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.key_prefix,
      webhook_url: k.webhook_url,
      permissions: JSON.parse(k.permissions) as string[],
      is_active: k.is_active,
      last_used_at: k.last_used_at,
      created_at: k.created_at,
    })),
    stats: {
      totalSessions: sessions.length,
      connected: sessionManager.getConnectedCount(),
      messagesToday: await messageRepository.countToday(),
      queue: messageQueue.getStats(),
    },
    sessions,
    recentMessages: await messageRepository.recent(20),
    auditLogs: await auditRepository.recent(50),
    sessionEvents: await sessionEventRepository.recent(undefined, 50),
    users:
      authUser.role === 'super_admin' ? await userRepository.list() : [],
    sessionStatus: {
      connected: sessionStatusLabel('connected'),
      qr_ready: sessionStatusLabel('qr_ready'),
      initializing: sessionStatusLabel('initializing'),
      reconnecting: sessionStatusLabel('reconnecting'),
      disconnected: sessionStatusLabel('disconnected'),
      failed: sessionStatusLabel('failed'),
    },
    auditLabels: {
      'api.request': auditActionLabel('api.request'),
      'webhook.failed': auditActionLabel('webhook.failed'),
      'user.request': auditActionLabel('user.request'),
    },
    activeTab: 'whatsapp',
    ...extras,
  };
}
