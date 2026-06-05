import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { messageRepository } from '../../services/database/repositories/message.repository.js';
import { sessionRepository } from '../../services/database/repositories/session.repository.js';
import { auditRepository } from '../../services/database/repositories/audit.repository.js';
import { messageQueue } from '../../services/queue/message-queue.js';
import { sessionManager } from '../../services/whatsapp/session-manager.js';
import { waEventBus } from '../../services/whatsapp/event-bus.js';
import { userRepository } from '../../services/database/repositories/user.repository.js';
import { verifyPassword, generateApiKey } from '../../utils/crypto.js';
import { apiKeyRepository } from '../../services/database/repositories/api-key.repository.js';
import { createApiKeySchema } from '../auth/auth.schema.js';
import { createSessionSchema, sessionIdParamSchema } from '../sessions/session.schema.js';
import { AppError, ERR } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';
import type { JwtPayload } from '../../types/index.js';

async function verifyDashboardCookie(
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

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  if (!config.dashboard.enabled) return;

  app.get('/login', async (_request, reply) => {
    return reply.view('login.ejs', { title: 'Login' });
  });

  app.post('/login', async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const user = userRepository.findByEmail(body.email ?? '');

    if (!user || !(await verifyPassword(body.password ?? '', user.password_hash))) {
      return reply.view('login.ejs', { title: 'Login', error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: 86400,
    });

    return reply.redirect('/dashboard');
  });

  app.get('/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.redirect('/login');
  });

  app.get('/dashboard', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const sessions = sessionRepository.list();
    const connected = sessionManager.getConnectedCount();
    const query = request.query as { scan?: string; error?: string; phone?: string };
    const scanSession = query.scan ?? null;
    const errorMessages: Record<string, string> = {
      invalid_input: 'Nomor HP tidak valid. Gunakan format 628123456789',
      invalid_session_id: 'Session ID tidak valid',
      create_failed: 'Gagal membuat session. Coba lagi.',
      phone_exists: 'Nomor HP sudah terdaftar pada session lain',
    };

    const apiKeys = request.authUser
      ? apiKeyRepository.findByUserId(request.authUser.sub)
      : [];

    return reply.view('dashboard.ejs', {
      title: 'Dashboard',
      scanSession,
      newApiKey: null,
      errorMessage: query.error ? errorMessages[query.error] ?? 'Terjadi kesalahan' : null,
      phoneHint: query.phone ?? null,
      apiKeys: apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.key_prefix,
        permissions: JSON.parse(k.permissions) as string[],
        is_active: k.is_active,
        last_used_at: k.last_used_at,
        created_at: k.created_at,
      })),
      stats: {
        totalSessions: sessions.length,
        connected,
        messagesToday: messageRepository.countToday(),
        queue: messageQueue.getStats(),
      },
      sessions,
      recentMessages: messageRepository.recent(20),
      auditLogs: auditRepository.recent(30),
    });
  });

  app.post('/dashboard/session/create', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const body = request.body as { phoneNumber?: string; sessionId?: string };
    const parsed = createSessionSchema.safeParse({
      phoneNumber: body.phoneNumber ?? '',
      sessionId: body.sessionId?.trim() || undefined,
    });

    if (!parsed.success) {
      return reply.redirect('/dashboard?error=invalid_input');
    }

    const { sessionId, phoneNumber } = parsed.data;

    try {
      await sessionManager.create(sessionId, {
        userId: request.authUser?.sub,
        phoneNumber,
      });
    } catch (err) {
      if (err instanceof AppError && err.code === ERR.SESSION_EXISTS) {
        if (err.message.includes('sudah terdaftar')) {
          return reply.redirect(`/dashboard?error=phone_exists&phone=${phoneNumber}`);
        }
        await sessionManager.restart(sessionId);
      } else {
        return reply.redirect(`/dashboard?error=create_failed&scan=${sessionId}`);
      }
    }

    return reply.redirect(`/dashboard?scan=${sessionId}&phone=${phoneNumber}`);
  });

  app.post('/dashboard/api-keys/create', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const body = request.body as { name?: string };
    const parsed = createApiKeySchema.safeParse({
      name: body.name ?? 'Laravel App',
      permissions: [
        'message:send',
        'session:read',
        'session:create',
        'session:manage',
      ],
    });

    if (!parsed.success) {
      return reply.redirect('/dashboard?error=invalid_input');
    }

    const { key, hash, prefix } = generateApiKey();
    apiKeyRepository.create({
      user_id: request.authUser!.sub,
      key_hash: hash,
      key_prefix: prefix,
      name: parsed.data.name,
      permissions: JSON.stringify(parsed.data.permissions ?? [
        'message:send',
        'session:read',
        'session:create',
        'session:manage',
      ]),
      webhook_url: parsed.data.webhook_url,
      webhook_events: parsed.data.webhook_events
        ? JSON.stringify(parsed.data.webhook_events)
        : undefined,
      ip_whitelist: parsed.data.ip_whitelist,
    });

    const sessions = sessionRepository.list();
    const apiKeys = apiKeyRepository.findByUserId(request.authUser!.sub);

    return reply.view('dashboard.ejs', {
      title: 'Dashboard',
      scanSession: null,
      newApiKey: key,
      errorMessage: null,
      phoneHint: null,
      apiKeys: apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.key_prefix,
        permissions: JSON.parse(k.permissions) as string[],
        is_active: k.is_active,
        last_used_at: k.last_used_at,
        created_at: k.created_at,
      })),
      stats: {
        totalSessions: sessions.length,
        connected: sessionManager.getConnectedCount(),
        messagesToday: messageRepository.countToday(),
        queue: messageQueue.getStats(),
      },
      sessions,
      recentMessages: messageRepository.recent(20),
      auditLogs: auditRepository.recent(30),
    });
  });

  app.get('/dashboard/session/:sessionId/qr', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const { sessionId } = sessionIdParamSchema.parse(request.params);
    await sessionManager.ensureConnection(sessionId);

    const qr = sessionManager.getQr(sessionId);
    const status = sessionManager.getStatus(sessionId);

    return sendSuccess(reply, { qr, status });
  });

  app.get('/ws/dashboard/logs', { websocket: true }, (socket) => {
    const unsub = waEventBus.onLog((sessionId, message, level) => {
      socket.send(
        JSON.stringify({
          type: 'log',
          sessionId,
          message,
          level,
          timestamp: new Date().toISOString(),
        }),
      );
    });

    socket.on('close', () => unsub());
  });

  app.post('/dashboard/send-test', async (request, reply) => {
    const token = request.cookies.token;
    if (!token) return reply.redirect('/login');

    const body = request.body as {
      sessionId?: string;
      to?: string;
      message?: string;
    };

    if (body.sessionId && body.to && body.message) {
      const { messageQueue: mq } = await import('../../services/queue/message-queue.js');
      mq.enqueue(body.sessionId, body.to, {
        type: 'text',
        message: body.message,
      });
    }

    return reply.redirect('/dashboard');
  });
}
