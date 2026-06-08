import type { FastifyInstance } from 'fastify';
import { verifyWsCookie, assertDashboardSessionAccess } from '../dashboard/dashboard.helper.js';
import { sessionManager } from '../../services/whatsapp/session-manager.js';
import { waEventBus } from '../../services/whatsapp/event-bus.js';
import { sessionRepository } from '../../services/database/repositories/session.repository.js';
import { AppError, ERR } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';
import { apiKeyAuth, jwtAuth, requirePermission } from '../../middleware/auth.js';
import { createSessionSchema, sessionIdParamSchema } from './session.schema.js';
import { assertApiKeySessionAccess } from '../../utils/session-access.js';

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/session/create', {
    preHandler: [apiKeyAuth, requirePermission('session:create')],
    schema: {
      tags: ['Sessions'],
      security: [{ apiKey: [] }],
    },
  }, async (request, reply) => {
    const body = createSessionSchema.parse(request.body);
    const apiKey = request.apiKey!;
    const bound = await sessionRepository.findByApiKeyId(apiKey.id);
    if (bound && bound.session_id !== body.sessionId) {
      throw new AppError(
        `API key terikat ke session "${bound.session_id}"`,
        ERR.SESSION_EXISTS,
        409,
      );
    }

    const existing = await sessionRepository.findBySessionId(body.sessionId);
    if (existing?.user_id && existing.user_id !== apiKey.user_id) {
      throw new AppError('Session milik akun lain', ERR.FORBIDDEN, 403);
    }
    if (existing?.api_key_id && existing.api_key_id !== apiKey.id) {
      throw new AppError('Session milik API key lain', ERR.FORBIDDEN, 403);
    }

    await sessionManager.create(body.sessionId, {
      apiKeyId: apiKey.id,
      userId: apiKey.user_id,
      phoneNumber: body.phoneNumber,
    });
    return sendSuccess(reply, {
      sessionId: body.sessionId,
      phoneNumber: body.phoneNumber,
      status: sessionManager.getStatus(body.sessionId),
    }, 201);
  });

  app.post('/api/session/create/admin', {
    preHandler: [jwtAuth],
    schema: { tags: ['Sessions'] },
  }, async (request, reply) => {
    const body = createSessionSchema.parse(request.body);
    await sessionManager.create(body.sessionId, { phoneNumber: body.phoneNumber });
    return sendSuccess(reply, {
      sessionId: body.sessionId,
      phoneNumber: body.phoneNumber,
      status: sessionManager.getStatus(body.sessionId),
    }, 201);
  });

  app.get('/api/session/:sessionId/qr', {
    preHandler: [apiKeyAuth, requirePermission('session:read')],
    schema: { tags: ['Sessions'] },
  }, async (request, reply) => {
    const { sessionId } = sessionIdParamSchema.parse(request.params);
    await assertApiKeySessionAccess(request.apiKey!, sessionId);
    const qr = sessionManager.getQr(sessionId);
    if (!qr) {
      const status = sessionManager.getStatus(sessionId);
      if (status === 'connected') {
        return sendSuccess(reply, { qr: null, status, message: 'Already connected' });
      }
      throw new AppError('QR not available', ERR.NOT_FOUND, 404);
    }
    return sendSuccess(reply, { qr, status: sessionManager.getStatus(sessionId) });
  });

  app.get('/api/session/:sessionId/status', {
    preHandler: [apiKeyAuth, requirePermission('session:read')],
    schema: { tags: ['Sessions'] },
  }, async (request, reply) => {
    const { sessionId } = sessionIdParamSchema.parse(request.params);
    const row = await assertApiKeySessionAccess(request.apiKey!, sessionId);
    return sendSuccess(reply, {
      sessionId,
      status: sessionManager.getStatus(sessionId),
      phone_number: row?.phone_number ?? null,
      display_name: row?.display_name ?? null,
      last_connected_at: row?.last_connected_at ?? null,
    });
  });

  app.get('/api/sessions', {
    preHandler: [apiKeyAuth, requirePermission('session:read')],
  }, async (request, reply) => {
    const sessions = await sessionRepository.listByApiKeyId(request.apiKey!.id);
    return sendSuccess(reply, sessions);
  });

  app.post('/api/session/:sessionId/reconnect', {
    preHandler: [apiKeyAuth, requirePermission('session:manage')],
  }, async (request, reply) => {
    const { sessionId } = sessionIdParamSchema.parse(request.params);
    await assertApiKeySessionAccess(request.apiKey!, sessionId);
    await sessionManager.restart(sessionId);
    return sendSuccess(reply, { status: sessionManager.getStatus(sessionId) });
  });

  app.post('/api/session/:sessionId/disconnect', {
    preHandler: [apiKeyAuth, requirePermission('session:manage')],
  }, async (request, reply) => {
    const { sessionId } = sessionIdParamSchema.parse(request.params);
    await assertApiKeySessionAccess(request.apiKey!, sessionId);
    await sessionManager.disconnect(sessionId);
    return sendSuccess(reply, { status: sessionManager.getStatus(sessionId) });
  });

  app.delete('/api/session/:sessionId', {
    preHandler: [apiKeyAuth, requirePermission('session:manage')],
  }, async (request, reply) => {
    const { sessionId } = sessionIdParamSchema.parse(request.params);
    await assertApiKeySessionAccess(request.apiKey!, sessionId);
    await sessionManager.deleteSession(sessionId);
    return sendSuccess(reply, { deleted: true });
  });

  app.get('/ws/session/:sessionId/qr', { websocket: true }, (socket, request) => {
    const authUser = verifyWsCookie(request, request.server);
    if (!authUser) {
      socket.close(1008, 'Unauthorized');
      return;
    }

    const { sessionId } = sessionIdParamSchema.parse(request.params);

    let lastSentQr: string | null = null;
    let lastSentStatus: string | null = null;

    const sendSnapshot = (force = false) => {
      const qr = sessionManager.getQr(sessionId);
      const status = sessionManager.getStatus(sessionId);

      if (!force && qr === lastSentQr && status === lastSentStatus) return;

      lastSentQr = qr;
      lastSentStatus = status;
      socket.send(JSON.stringify({ type: 'qr', qr, status }));

      if (status === 'connected' || status === 'failed') {
        clearInterval(interval);
      }
    };

    void (async () => {
      try {
        await assertDashboardSessionAccess(authUser, sessionId);
      } catch {
        socket.send(JSON.stringify({
          type: 'error',
          message: 'Session bukan milik akun Anda',
          status: 'failed',
        }));
        socket.close(1008, 'Forbidden');
        return;
      }

      try {
        await sessionManager.ensureConnection(sessionId);
        sendSnapshot(true);
      } catch {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Failed to start session connection',
        status: sessionManager.getStatus(sessionId),
      }));
      }
    })();

    const unsubQr = waEventBus.onQr((sid, qr) => {
      if (sid === sessionId) {
        lastSentQr = qr;
        lastSentStatus = 'qr_ready';
        socket.send(JSON.stringify({ type: 'qr', qr, status: 'qr_ready' }));
      }
    });

    const unsubStatus = waEventBus.onStatus((sid) => {
      if (sid === sessionId) {
        sendSnapshot(false);
      }
    });

    // Heartbeat jarang — hanya jika ada perubahan
    const interval = setInterval(() => sendSnapshot(false), 20000);

    socket.on('close', () => {
      unsubQr();
      unsubStatus();
      clearInterval(interval);
    });
  });
}
