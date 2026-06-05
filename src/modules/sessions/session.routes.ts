import type { FastifyInstance } from 'fastify';
import { sessionManager } from '../../services/whatsapp/session-manager.js';
import { waEventBus } from '../../services/whatsapp/event-bus.js';
import { sessionRepository } from '../../services/database/repositories/session.repository.js';
import { AppError, ERR } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';
import { apiKeyAuth, jwtAuth, requirePermission } from '../../middleware/auth.js';
import { createSessionSchema, sessionIdParamSchema } from './session.schema.js';

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/session/create', {
    preHandler: [apiKeyAuth, requirePermission('session:create')],
    schema: {
      tags: ['Sessions'],
      security: [{ apiKey: [] }],
    },
  }, async (request, reply) => {
    const body = createSessionSchema.parse(request.body);
    await sessionManager.create(body.sessionId, {
      apiKeyId: request.apiKey?.id,
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
    const row = sessionRepository.findBySessionId(sessionId);
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
  }, async (_request, reply) => {
    const sessions = sessionRepository.list();
    return sendSuccess(reply, sessions);
  });

  app.post('/api/session/:sessionId/reconnect', {
    preHandler: [apiKeyAuth, requirePermission('session:manage')],
  }, async (request, reply) => {
    const { sessionId } = sessionIdParamSchema.parse(request.params);
    await sessionManager.restart(sessionId);
    return sendSuccess(reply, { status: sessionManager.getStatus(sessionId) });
  });

  app.post('/api/session/:sessionId/disconnect', {
    preHandler: [apiKeyAuth, requirePermission('session:manage')],
  }, async (request, reply) => {
    const { sessionId } = sessionIdParamSchema.parse(request.params);
    await sessionManager.disconnect(sessionId);
    return sendSuccess(reply, { status: sessionManager.getStatus(sessionId) });
  });

  app.delete('/api/session/:sessionId', {
    preHandler: [apiKeyAuth, requirePermission('session:manage')],
  }, async (request, reply) => {
    const { sessionId } = sessionIdParamSchema.parse(request.params);
    await sessionManager.deleteSession(sessionId);
    return sendSuccess(reply, { deleted: true });
  });

  app.get('/ws/session/:sessionId/qr', { websocket: true }, (socket, request) => {
    const { sessionId } = sessionIdParamSchema.parse(request.params);

    const sendQr = () => {
      const qr = sessionManager.getQr(sessionId);
      const status = sessionManager.getStatus(sessionId);
      socket.send(JSON.stringify({ type: 'qr', qr, status }));
    };

    void sessionManager.ensureConnection(sessionId).then(() => {
      sendQr();
    }).catch(() => {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Failed to start session connection',
        status: sessionManager.getStatus(sessionId),
      }));
    });

    const unsubQr = waEventBus.onQr((sid, qr) => {
      if (sid === sessionId) {
        socket.send(JSON.stringify({ type: 'qr', qr, status: 'qr_ready' }));
      }
    });

    const unsubStatus = waEventBus.onStatus((sid, status) => {
      if (sid === sessionId) {
        socket.send(JSON.stringify({ type: 'status', status }));
      }
    });

    const interval = setInterval(sendQr, 5000);

    socket.on('close', () => {
      unsubQr();
      unsubStatus();
      clearInterval(interval);
    });
  });
}
