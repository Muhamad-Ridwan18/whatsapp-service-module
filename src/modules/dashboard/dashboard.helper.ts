import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { getAccountBundle } from '../../services/account/account.service.js';
import { auditRepository } from '../../services/database/repositories/audit.repository.js';
import { messageRepository } from '../../services/database/repositories/message.repository.js';
import { userRepository } from '../../services/database/repositories/user.repository.js';
import { messageQueue } from '../../services/queue/message-queue.js';
import { sessionManager } from '../../services/whatsapp/session-manager.js';
import type { JwtPayload, UserRole } from '../../types/index.js';
import { AppError, ERR } from '../../utils/errors.js';
import { decryptApiKey } from '../../utils/crypto.js';
import { auditActionLabel, formatLogTime, sessionEventLabel, sessionStatusLabel } from '../../utils/labels.js';

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

export async function assertDashboardSessionAccess(
  authUser: JwtPayload,
  sessionId: string,
) {
  const bundle = await getAccountBundle(authUser.sub);
  if (!bundle.session || bundle.session.session_id !== sessionId) {
    throw new AppError('Session tidak ditemukan', ERR.SESSION_NOT_FOUND, 404);
  }
  if (!isDashboardAdmin(authUser.role) && bundle.user.id !== authUser.sub) {
    throw new AppError('Akses ditolak', ERR.FORBIDDEN, 403);
  }
  return bundle.session;
}

export async function getDashboardContext(
  authUser: JwtPayload,
  extras?: Record<string, unknown>,
) {
  const bundle = await getAccountBundle(authUser.sub);
  const session = bundle.session;
  const apiKey = bundle.apiKey;
  const apiKeyPlain = apiKey ? decryptApiKey(apiKey.key_encrypted) : null;
  const sessionId = session?.session_id ?? null;
  const liveStatus = sessionId ? sessionManager.getStatus(sessionId) : 'disconnected';

  return {
    currentUser: {
      id: authUser.sub,
      email: authUser.email,
      phone: bundle.user.phone_number,
      name: bundle.user.name,
      role: authUser.role,
    },
    account: {
      phone: bundle.user.phone_number,
      sessionId,
      sessionStatus: liveStatus,
      sessionStatusLabel: sessionStatusLabel(liveStatus).label,
      apiKey: apiKeyPlain,
      apiKeyPrefix: apiKey?.key_prefix ?? null,
      apiKeyActive: !!apiKey?.is_active,
      webhookUrl: apiKey?.webhook_url ?? null,
    },
    scanSession: (extras?.scanSession as string | null | undefined) ?? sessionId,
    errorMessage: null,
    successMessage: extras?.successMessage ?? null,
    stats: {
      connected: liveStatus === 'connected' ? 1 : 0,
      messagesToday: await messageRepository.countToday(),
      queue: messageQueue.getStats(),
    },
    recentMessages: sessionId
      ? (await messageRepository.recent(10)).filter((m) => m.session_id === sessionId)
      : [],
    auditLogs: await auditRepository.recentSafe(20),
    users: authUser.role === 'super_admin' ? await userRepository.list() : [],
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
    formatLogTime,
    sessionEventLabel,
    auditActionLabel,
    baseUrl: config.baseUrl,
    ...extras,
  };
}

export async function getLogsContext(
  authUser: JwtPayload,
  query: { sessionId?: string; tab?: string },
) {
  const bundle = await getAccountBundle(authUser.sub);
  const sessionId = query.sessionId?.trim() || bundle.session?.session_id;
  const activeLogTab = query.tab === 'audit' || query.tab === 'message' ? query.tab : 'session';

  const { sessionEventRepository } = await import(
    '../../services/database/repositories/session-event.repository.js'
  );

  const [sessionEvents, auditLogs, messageLogs] = await Promise.all([
    sessionEventRepository.recentSafe(sessionId, 150),
    auditRepository.recentSafe(150),
    messageRepository.recentLogsSafe(150),
  ]);

  return {
    currentUser: {
      id: authUser.sub,
      email: authUser.email,
      phone: bundle.user.phone_number,
      role: authUser.role,
    },
    title: 'Log',
    activePage: 'logs',
    activeLogTab,
    filterSessionId: sessionId ?? '',
    sessionEvents,
    auditLogs,
    messageLogs,
    sessions: bundle.session ? [bundle.session] : [],
    errorMessage: null,
    successMessage: null,
    formatLogTime,
    sessionEventLabel,
    auditActionLabel,
  };
}
