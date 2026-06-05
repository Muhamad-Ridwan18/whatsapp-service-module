import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { messageQueue } from '../../services/queue/message-queue.js';
import type { MessagePayload } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import { apiKeyAuth, requirePermission } from '../../middleware/auth.js';
import { sendMessageSchema, bulkMessageSchema } from './message.schema.js';
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
  apiKeyId?: number,
): Promise<FastifyReply> {
  const body = sendMessageSchema.parse(request.body);
  const jobId = messageQueue.enqueue(
    body.sessionId,
    body.to,
    toPayload(body),
    { apiKeyId },
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
  }, async (request, reply) => {
    return handleSendMessage(request, reply, request.apiKey?.id);
  });

  // Alias kompatibel Fonnte — JSON atau application/x-www-form-urlencoded
  app.post('/send', {
    preHandler: sendHandlers,
    schema: {
      tags: ['Messaging'],
      security: [{ apiKey: [] }],
      description: 'Alias Fonnte. Field: target, countryCode, message, url, filename, sessionId.',
    },
  }, async (request, reply) => {
    return handleSendMessage(request, reply, request.apiKey?.id);
  });

  app.post('/api/message/bulk', {
    preHandler: sendHandlers,
    schema: { tags: ['Messaging'], security: [{ apiKey: [] }] },
  }, async (request, reply) => {
    const body = bulkMessageSchema.parse(request.body);
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
