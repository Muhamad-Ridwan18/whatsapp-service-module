import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { messageQueue } from '../../services/queue/message-queue.js';
import type { MessagePayload } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import { apiKeyAuth, requirePermission } from '../../middleware/auth.js';
import { sendMessageSchema, bulkMessageSchema } from './message.schema.js';
import { assertApiKeySessionAccess } from '../../utils/session-access.js';
import type { z } from 'zod';

type ParsedMessage = z.infer<typeof sendMessageSchema>;

function toPayload(body: ParsedMessage): MessagePayload {
  return {
    type: body.type,
    message: body.message,
    mediaUrl: body.mediaUrl,
    caption: body.caption,
    fileName: body.fileName,
    mimetype: body.mimetype,
    latitude: body.latitude,
    longitude: body.longitude,
    contactName: body.contactName,
    contactNumber: body.contactNumber,
  };
}

async function handleSendMessage(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const body = sendMessageSchema.parse(request.body);
  assertApiKeySessionAccess(request.apiKey!, body.sessionId);

  const jobId = messageQueue.enqueue(
    body.sessionId,
    body.to,
    toPayload(body),
    { apiKeyId: request.apiKey?.id },
  );

  return sendSuccess(reply, {
    success: true,
    jobId,
    to: body.to,
    message: 'Message queued for delivery',
  }, 202);
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  const sendHandlers = [apiKeyAuth, requirePermission('message:send')];

  app.post('/api/message/send', {
    preHandler: sendHandlers,
    schema: {
      tags: ['Messaging'],
      security: [{ apiKey: [] }],
      description: 'Kirim pesan WhatsApp via antrian. Nomor: `to` atau `target`+`countryCode`.',
    },
  }, handleSendMessage);

  app.post('/send', {
    preHandler: sendHandlers,
    schema: {
      tags: ['Messaging'],
      security: [{ apiKey: [] }],
      description: 'Alias Fonnte. Field: target, countryCode, message, url, filename, sessionId.',
    },
  }, handleSendMessage);

  app.post('/api/message/bulk', {
    preHandler: sendHandlers,
    schema: { tags: ['Messaging'], security: [{ apiKey: [] }] },
  }, async (request, reply) => {
    const body = bulkMessageSchema.parse(request.body);
    for (const msg of body.messages) {
      assertApiKeySessionAccess(request.apiKey!, msg.sessionId);
    }

    const jobIds = messageQueue.enqueueBulk(
      body.messages,
      request.apiKey?.id,
    );

    return sendSuccess(reply, {
      success: true,
      queued: jobIds.length,
      jobIds,
    }, 202);
  });

  app.get('/api/message/queue/stats', {
    preHandler: [apiKeyAuth],
  }, async (_request, reply) => {
    return sendSuccess(reply, messageQueue.getStats());
  });
}
