import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { messageQueue } from '../../services/queue/message-queue.js';
import { sessionManager } from '../../services/whatsapp/session-manager.js';
import { userRepository } from '../../services/database/repositories/user.repository.js';
import { apiKeyRepository } from '../../services/database/repositories/api-key.repository.js';
import { verifyPassword, hashPassword } from '../../utils/crypto.js';
import {
  registerClientAccount,
  createClientAccountByAdmin,
  rotateApiKey,
  getAccountBundle,
} from '../../services/account/account.service.js';
import { AppError, ERR } from '../../utils/errors.js';
import { sendError, sendSuccess } from '../../utils/response.js';
import {
  verifyDashboardCookie,
  requireDashboardRole,
  getDashboardContext,
  getLogsContext,
  assertDashboardSessionAccess,
} from './dashboard.helper.js';
import { roleLabel } from '../../utils/labels.js';
import { authLogger } from '../../services/logger/index.js';
import { resolvePhoneNumber } from '../../utils/phone.js';
import type { UserRow } from '../../types/index.js';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: 'Input tidak valid',
  invalid_phone: 'Nomor tujuan tidak valid',
  phone_exists: 'Nomor WhatsApp sudah terdaftar',
  password_mismatch: 'Konfirmasi password tidak cocok',
  wrong_password: 'Password saat ini salah',
  session_forbidden: 'Akses ditolak',
  reconnect_failed: 'Gagal menghubungkan ulang',
  phone_mismatch: 'Nomor yang discan tidak cocok dengan nomor terdaftar',
  session_not_connected: 'WhatsApp belum terhubung. Scan QR di tab WhatsApp.',
  no_session: 'Belum ada session WhatsApp.',
};

function wantsJsonResponse(request: FastifyRequest): boolean {
  return (request.headers.accept ?? '').includes('application/json');
}

function authCookieOptions(request: FastifyRequest) {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const isSecure =
    config.isProd &&
    (forwardedProto === 'https' || request.protocol === 'https');
  return {
    path: '/',
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    maxAge: 86400,
  };
}

function signDashboardToken(app: FastifyInstance, user: UserRow): string {
  return app.jwt.sign({
    sub: user.id,
    email: user.email,
    phone: user.phone_number,
    role: user.role,
  });
}

function setAuthCookie(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  user: UserRow,
): void {
  reply.setCookie('token', signDashboardToken(app, user), authCookieOptions(request));
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  if (!config.dashboard.enabled) return;

  app.get('/login', async (_request, reply) => {
    return reply.view('login.ejs', { title: 'Login' });
  });

  app.get('/register', async (_request, reply) => {
    return reply.view('register.ejs', { title: 'Daftar' });
  });

  app.post('/register', async (request, reply) => {
    const body = request.body as {
      name?: string;
      phone?: string;
      password?: string;
      confirmPassword?: string;
    };

    const name = (body.name ?? '').trim();
    const phone = (body.phone ?? '').trim();
    const password = body.password ?? '';

    if (!name || !phone || password.length < 6) {
      return reply.view('register.ejs', {
        title: 'Daftar',
        error: 'Lengkapi semua field. Password minimal 6 karakter.',
      });
    }
    if (password !== body.confirmPassword) {
      return reply.view('register.ejs', {
        title: 'Daftar',
        error: 'Konfirmasi password tidak cocok.',
      });
    }

    try {
      const created = await registerClientAccount({ phone, password, name });
      const user = await userRepository.findById(created.userId);
      if (!user) {
        return reply.view('register.ejs', { title: 'Daftar', error: 'Gagal membuat akun.' });
      }

      setAuthCookie(app, request, reply, user);
      authLogger.info({ phone: created.phone }, 'Client registered');
      return reply.redirect(`/dashboard?scan=${created.sessionId}&success=registered`);
    } catch (err) {
      if (err instanceof AppError && err.code === ERR.SESSION_EXISTS) {
        return reply.view('register.ejs', { title: 'Daftar', error: 'Nomor WhatsApp sudah terdaftar.' });
      }
      if (err instanceof AppError && err.code === ERR.VALIDATION) {
        return reply.view('register.ejs', { title: 'Daftar', error: err.message });
      }
      throw err;
    }
  });

  app.post('/login', async (request, reply) => {
    const body = request.body as { phone?: string; password?: string };
    const phone = (body.phone ?? '').trim();
    const password = body.password ?? '';

    if (!phone) {
      return reply.view('login.ejs', {
        title: 'Login',
        error: 'Nomor WhatsApp wajib diisi.',
      });
    }

    const user = await userRepository.findByLogin(phone);

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      authLogger.warn(
        { phone, userFound: !!user, dbDriver: config.database.driver },
        'Dashboard login failed',
      );
      return reply.view('login.ejs', {
        title: 'Login',
        error: 'Nomor atau password salah.',
      });
    }

    setAuthCookie(app, request, reply, user);
    authLogger.info({ phone, dbDriver: config.database.driver }, 'Dashboard login OK');

    const bundle = await getAccountBundle(user.id);
    const scan = bundle.session?.session_id;
    return reply.redirect(scan ? `/dashboard?scan=${scan}` : '/dashboard');
  });

  app.get('/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.redirect('/login');
  });

  app.get('/dashboard', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const query = request.query as {
      scan?: string;
      error?: string;
      success?: string;
      tab?: string;
      job?: string;
    };
    const successMap: Record<string, string> = {
      registered: 'Akun berhasil dibuat. Scan QR untuk menghubungkan WhatsApp.',
      webhook_saved: 'Webhook URL berhasil disimpan.',
      message_queued: query.job
        ? `Pesan masuk antrian (job: ${query.job}). Estimasi kirim 3–8 detik.`
        : 'Pesan masuk antrian. Estimasi kirim 3–8 detik.',
    };

    const ctx = await getDashboardContext(request.authUser!, {
      title: 'Dashboard',
      activePage: 'dashboard',
      activeTab: query.tab ?? 'whatsapp',
      ...(query.scan ? { scanSession: query.scan } : {}),
      errorMessage: query.error ? ERROR_MESSAGES[query.error] ?? 'Terjadi kesalahan' : null,
      successMessage: query.success ? successMap[query.success] ?? null : null,
      ...(query.job ? { testJobId: query.job } : {}),
    });

    return reply.view('dashboard.ejs', ctx);
  });

  app.get('/dashboard/logs', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;
    const query = request.query as { sessionId?: string; tab?: string };
    const ctx = await getLogsContext(request.authUser!, query);
    return reply.view('logs.ejs', ctx);
  });

  app.get('/dashboard/settings', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;
    const query = request.query as { error?: string; success?: string };
    const bundle = await getAccountBundle(request.authUser!.sub);

    return reply.view('settings.ejs', {
      title: 'Settings',
      activePage: 'settings',
      currentUser: {
        ...request.authUser,
        phone: bundle.user.phone_number,
        name: bundle.user.name,
      },
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

    const user = await userRepository.findById(request.authUser!.sub);
    if (!user || !(await verifyPassword(body.currentPassword ?? '', user.password_hash))) {
      return reply.redirect('/dashboard/settings?error=wrong_password');
    }

    const hash = await hashPassword(body.newPassword);
    await userRepository.updatePassword(user.id, hash);
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
    const ctx = await getDashboardContext(request.authUser!, {
      title: 'Users',
      activePage: 'users',
      errorMessage: query.error ? ERROR_MESSAGES[query.error] ?? 'Terjadi kesalahan' : null,
      successMessage: query.success === '1' ? 'Akun klien berhasil dibuat' : null,
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
      phone?: string;
      password?: string;
    };

    if (!body.phone || !body.password || body.password.length < 6 || !body.name?.trim()) {
      return reply.redirect('/dashboard/users?error=invalid_input');
    }

    try {
      await createClientAccountByAdmin({
        phone: body.phone,
        password: body.password,
        name: body.name.trim(),
      });
    } catch (err) {
      if (err instanceof AppError && err.code === ERR.SESSION_EXISTS) {
        return reply.redirect('/dashboard/users?error=phone_exists');
      }
      throw err;
    }

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
    const target = await userRepository.findById(id);
    if (target && target.id !== request.authUser!.sub && target.role !== 'super_admin') {
      await userRepository.deactivate(id);
    }

    return reply.redirect('/dashboard/users');
  });

  app.post('/dashboard/session/reconnect', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const bundle = await getAccountBundle(request.authUser!.sub);
    const sessionId = bundle.session?.session_id;
    if (!sessionId) {
      return reply.redirect('/dashboard?error=invalid_input');
    }

    try {
      await sessionManager.restart(sessionId);
    } catch {
      return reply.redirect('/dashboard?error=reconnect_failed');
    }
    return reply.redirect(`/dashboard?scan=${sessionId}`);
  });

  app.post('/dashboard/session/disconnect', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const bundle = await getAccountBundle(request.authUser!.sub);
    const sessionId = bundle.session?.session_id;
    if (!sessionId) {
      return reply.redirect('/dashboard');
    }

    await sessionManager.disconnect(sessionId);
    return reply.redirect('/dashboard');
  });

  app.post('/dashboard/api-key/rotate', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const body = request.body as { webhook_url?: string };
    const { apiKey } = await rotateApiKey(request.authUser!.sub);

    if (body.webhook_url !== undefined) {
      const bundle = await getAccountBundle(request.authUser!.sub);
      if (bundle.apiKey) {
        await apiKeyRepository.update(bundle.apiKey.id, { webhook_url: body.webhook_url || null });
      }
    }

    const ctx = await getDashboardContext(request.authUser!, {
      title: 'Dashboard',
      activePage: 'dashboard',
      activeTab: 'apikeys',
      newApiKey: apiKey,
      successMessage: 'API key baru dibuat. Key lama otomatis dinonaktifkan.',
    });

    return reply.view('dashboard.ejs', ctx);
  });

  app.post('/dashboard/webhook', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const body = request.body as { webhook_url?: string };
    const bundle = await getAccountBundle(request.authUser!.sub);
    if (bundle.apiKey) {
      await apiKeyRepository.update(bundle.apiKey.id, { webhook_url: body.webhook_url?.trim() || null });
    }

    return reply.redirect('/dashboard?tab=apikeys&success=webhook_saved');
  });

  app.get('/dashboard/session/:sessionId/qr', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const sessionId = (request.params as { sessionId: string }).sessionId;
    await assertDashboardSessionAccess(request.authUser!, sessionId);
    await sessionManager.ensureConnection(sessionId);

    return sendSuccess(reply, {
      qr: sessionManager.getQr(sessionId),
      status: sessionManager.getStatus(sessionId),
    });
  });

  app.post('/dashboard/send-test', async (request, reply) => {
    if (!(await verifyDashboardCookie(request, reply, app))) return;

    const json = wantsJsonResponse(request);
    const body = request.body as { to?: string; message?: string };
    const toRaw = (body.to ?? '').trim();
    const message = (body.message ?? '').trim();

    if (!toRaw || !message) {
      if (json) {
        return sendError(reply, ERROR_MESSAGES.invalid_input, 'ERR_VALIDATION', 400);
      }
      return reply.redirect('/dashboard?tab=test&error=invalid_input');
    }

    const bundle = await getAccountBundle(request.authUser!.sub);
    const sessionId = bundle.session?.session_id;

    if (!sessionId) {
      if (json) {
        return sendError(reply, ERROR_MESSAGES.no_session, 'ERR_NOT_FOUND', 400);
      }
      return reply.redirect('/dashboard?tab=test&error=no_session');
    }

    if (sessionManager.getStatus(sessionId) !== 'connected') {
      if (json) {
        return sendError(reply, ERROR_MESSAGES.session_not_connected, 'ERR_SESSION_NOT_CONNECTED', 400);
      }
      return reply.redirect('/dashboard?tab=test&error=session_not_connected');
    }

    let normalizedTo: string;
    try {
      normalizedTo = resolvePhoneNumber({ to: toRaw });
    } catch {
      if (json) {
        return sendError(reply, ERROR_MESSAGES.invalid_phone, 'ERR_VALIDATION', 400);
      }
      return reply.redirect('/dashboard?tab=test&error=invalid_phone');
    }

    const jobId = messageQueue.enqueue(sessionId, normalizedTo, {
      type: 'text',
      message,
    });

    if (json) {
      return sendSuccess(reply, {
        success: true,
        jobId,
        to: normalizedTo,
        message: 'Pesan masuk antrian',
        queue: messageQueue.getStats(),
      }, 202);
    }

    return reply.redirect(`/dashboard?tab=test&success=message_queued&job=${jobId}`);
  });
}
