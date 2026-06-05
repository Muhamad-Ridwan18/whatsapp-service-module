import type { FastifyInstance } from 'fastify';
import { config } from '../../config/index.js';
import { messageQueue } from '../../services/queue/message-queue.js';
import { sessionManager } from '../../services/whatsapp/session-manager.js';
import { userRepository } from '../../services/database/repositories/user.repository.js';
import { verifyPassword, hashPassword } from '../../utils/crypto.js';
import { apiKeyRepository } from '../../services/database/repositories/api-key.repository.js';
import { sessionRepository } from '../../services/database/repositories/session.repository.js';
import { createApiKeyForUser } from '../../services/auth/api-key.service.js';
import { createApiKeySchema } from '../auth/auth.schema.js';
import { createSessionSchema, sessionIdParamSchema } from '../sessions/session.schema.js';
import { AppError, ERR } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';
import {
  verifyDashboardCookie,
  requireDashboardRole,
  getDashboardContext,
  assertDashboardSessionAccess,
} from './dashboard.helper.js';
import { roleLabel } from '../../utils/labels.js';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: 'Input tidak valid',
  invalid_session_id: 'Session ID tidak valid',
  create_failed: 'Gagal membuat session',
  phone_exists: 'Nomor HP sudah terdaftar pada session lain',
  session_forbidden: 'Session/nomor ini milik akun lain. Hubungi admin.',
  password_mismatch: 'Konfirmasi password tidak cocok',
  wrong_password: 'Password saat ini salah',
  user_exists: 'Email sudah terdaftar',
};

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

    const query = request.query as { scan?: string; error?: string; phone?: string; success?: string; tab?: string };
    const ctx = getDashboardContext(request.authUser!, {
      title: 'Dashboard',
      activePage: 'dashboard',
      scanSession: query.scan ?? null,
      phoneHint: query.phone ?? null,
      activeTab: query.tab ?? (query.scan ? 'whatsapp' : 'whatsapp'),
      errorMessage: query.error ? ERROR_MESSAGES[query.error] ?? 'Terjadi kesalahan' : null,
      successMessage: query.success === 'key_revoked' ? 'API key berhasil dinonaktifkan' : null,
    });

    return reply.view('dashboard.ejs', ctx);
  });

  app.get('/dashboard/settings', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;
    const query = request.query as { error?: string; success?: string };

    return reply.view('settings.ejs', {
      title: 'Settings',
      activePage: 'settings',
      currentUser: request.authUser,
      roleLabel: roleLabel(request.authUser!.role),
      errorMessage: query.error ? ERROR_MESSAGES[query.error] ?? 'Terjadi kesalahan' : null,
      successMessage: query.success === '1' ? 'Password berhasil diubah' : null,
    });
  });

  app.post('/dashboard/settings/password', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const body = request.body as {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };

    if (!body.newPassword || body.newPassword.length < 6) {
      return reply.redirect('/dashboard/settings?error=invalid_input');
    }
    if (body.newPassword !== body.confirmPassword) {
      return reply.redirect('/dashboard/settings?error=password_mismatch');
    }

    const user = userRepository.findById(request.authUser!.sub);
    if (!user || !(await verifyPassword(body.currentPassword ?? '', user.password_hash))) {
      return reply.redirect('/dashboard/settings?error=wrong_password');
    }

    const hash = await hashPassword(body.newPassword);
    userRepository.updatePassword(user.email, hash);
    return reply.redirect('/dashboard/settings?success=1');
  });

  app.get('/dashboard/users', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;
    try {
      requireDashboardRole(request, 'super_admin');
    } catch {
      return reply.redirect('/dashboard');
    }

    const query = request.query as { error?: string; success?: string };
    const ctx = getDashboardContext(request.authUser!, {
      title: 'Users',
      activePage: 'users',
      errorMessage: query.error ? ERROR_MESSAGES[query.error] ?? 'Terjadi kesalahan' : null,
      successMessage: query.success === '1' ? 'User berhasil dibuat' : null,
    });

    return reply.view('users.ejs', ctx);
  });

  app.post('/dashboard/users/create', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;
    try {
      requireDashboardRole(request, 'super_admin');
    } catch {
      return reply.redirect('/dashboard');
    }

    const body = request.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };

    if (!body.email || !body.password || body.password.length < 6 || !body.name) {
      return reply.redirect('/dashboard/users?error=invalid_input');
    }
    if (userRepository.findByEmail(body.email)) {
      return reply.redirect('/dashboard/users?error=user_exists');
    }

    const passwordHash = await hashPassword(body.password);
    userRepository.createClient({
      email: body.email,
      password_hash: passwordHash,
      name: body.name,
      role: body.role === 'admin' ? 'admin' : 'client',
    });

    return reply.redirect('/dashboard/users?success=1');
  });

  app.post('/dashboard/users/:id/deactivate', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;
    try {
      requireDashboardRole(request, 'super_admin');
    } catch {
      return reply.redirect('/dashboard');
    }

    const id = parseInt((request.params as { id: string }).id, 10);
    const target = userRepository.findById(id);
    if (target && target.id !== request.authUser!.sub && target.role !== 'super_admin') {
      userRepository.deactivate(id);
    }

    return reply.redirect('/dashboard/users');
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
      const activeKey = apiKeyRepository.findActiveByUserId(request.authUser!.sub);
      const bound = activeKey
        ? sessionRepository.findByApiKeyId(activeKey.id)
        : undefined;
      if (bound && bound.session_id !== sessionId) {
        return reply.redirect('/dashboard?error=key_session_limit');
      }

      await sessionManager.create(sessionId, {
        userId: request.authUser!.sub,
        apiKeyId: activeKey?.id,
        phoneNumber,
      });
    } catch (err) {
      if (err instanceof AppError) {
        if (err.code === ERR.FORBIDDEN) {
          return reply.redirect('/dashboard?error=session_forbidden');
        }
        if (err.code === ERR.SESSION_EXISTS && err.message.includes('sudah terdaftar')) {
          return reply.redirect(`/dashboard?error=phone_exists&phone=${phoneNumber}`);
        }
        if (err.code === ERR.SESSION_LIMIT) {
          return reply.redirect('/dashboard?error=session_limit');
        }
      }
      return reply.redirect(`/dashboard?error=create_failed&scan=${sessionId}`);
    }

    return reply.redirect(`/dashboard?scan=${sessionId}&phone=${phoneNumber}`);
  });

  app.post('/dashboard/session/:sessionId/reconnect', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;
    const { sessionId } = sessionIdParamSchema.parse(request.params);
    try {
      assertDashboardSessionAccess(request.authUser!, sessionId);
      await sessionManager.restart(sessionId);
    } catch (err) {
      if (err instanceof AppError && err.code === ERR.FORBIDDEN) {
        return reply.redirect('/dashboard?error=session_forbidden');
      }
      throw err;
    }
    return reply.redirect(`/dashboard?scan=${sessionId}`);
  });

  app.post('/dashboard/session/:sessionId/disconnect', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;
    const { sessionId } = sessionIdParamSchema.parse(request.params);
    try {
      assertDashboardSessionAccess(request.authUser!, sessionId);
      await sessionManager.disconnect(sessionId);
    } catch (err) {
      if (err instanceof AppError && err.code === ERR.FORBIDDEN) {
        return reply.redirect('/dashboard?error=session_forbidden');
      }
      throw err;
    }
    return reply.redirect('/dashboard');
  });

  app.post('/dashboard/session/:sessionId/delete', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;
    const { sessionId } = sessionIdParamSchema.parse(request.params);
    try {
      assertDashboardSessionAccess(request.authUser!, sessionId);
      await sessionManager.deleteSession(sessionId);
    } catch (err) {
      if (err instanceof AppError && err.code === ERR.FORBIDDEN) {
        return reply.redirect('/dashboard?error=session_forbidden');
      }
      throw err;
    }
    return reply.redirect('/dashboard');
  });

  app.post('/dashboard/api-keys/create', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const body = request.body as { name?: string; webhook_url?: string };

    const parsed = createApiKeySchema.safeParse({
      name: body.name ?? 'Laravel App',
      webhook_url: body.webhook_url || null,
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

    const created = createApiKeyForUser(request.authUser!.sub, {
      name: parsed.data.name,
      permissions: parsed.data.permissions ?? [
        'message:send',
        'session:read',
        'session:create',
        'session:manage',
      ],
      webhook_url: parsed.data.webhook_url,
      webhook_events: parsed.data.webhook_events,
    });

    const ctx = getDashboardContext(request.authUser!, {
      title: 'Dashboard',
      activePage: 'dashboard',
      activeTab: 'apikeys',
      newApiKey: created.apiKey,
      successMessage: created.replaced
        ? 'API key baru dibuat. Key lama otomatis dinonaktifkan.'
        : 'API key berhasil dibuat.',
    });

    return reply.view('dashboard.ejs', ctx);
  });

  app.post('/dashboard/api-keys/:id/revoke', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const id = parseInt((request.params as { id: string }).id, 10);
    const key =
      request.authUser!.role === 'super_admin'
        ? apiKeyRepository.findById(id)
        : apiKeyRepository.findByIdAndUserId(id, request.authUser!.sub);

    if (key?.is_active) {
      apiKeyRepository.deactivate(id);
    }

    return reply.redirect('/dashboard?success=key_revoked&tab=apikeys');
  });

  app.get('/dashboard/session/:sessionId/qr', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const { sessionId } = sessionIdParamSchema.parse(request.params);
    assertDashboardSessionAccess(request.authUser!, sessionId);

    return sendSuccess(reply, {
      qr: sessionManager.getQr(sessionId),
      status: sessionManager.getStatus(sessionId),
    });
  });

  app.post('/dashboard/send-test', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const body = request.body as {
      sessionId?: string;
      to?: string;
      message?: string;
    };

    if (body.sessionId && body.to && body.message) {
      try {
        assertDashboardSessionAccess(request.authUser!, body.sessionId);
        messageQueue.enqueue(body.sessionId, body.to, {
          type: 'text',
          message: body.message,
        });
      } catch (err) {
        if (err instanceof AppError && err.code === ERR.FORBIDDEN) {
          return reply.redirect('/dashboard?error=session_forbidden');
        }
        throw err;
      }
    }

    return reply.redirect('/dashboard');
  });
}
