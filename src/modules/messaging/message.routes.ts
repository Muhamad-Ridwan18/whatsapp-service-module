import type { FastifyInstance } from 'fastify';
import { messageQueue } from '../../services/queue/message-queue.js';
import type { MessagePayload } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import { apiKeyAuth, requirePermission } from '../../middleware/auth.js';
import { sendMessageSchema, bulkMessageSchema } from './message.schema.js';

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/message/send', {
    preHandler: [apiKeyAuth, requirePermission('message:send')],
    schema: {
      tags: ['Messaging'],
      security: [{ apiKey: [] }],
      description: 'Send a WhatsApp message via queue',
    },
  }, async (request, reply) => {
    const body = sendMessageSchema.parse(request.body);

    const payload: MessagePayload = {
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

    const jobId = messageQueue.enqueue(
      body.sessionId,
      body.to,
      payload,
      { apiKeyId: request.apiKey?.id },
    );

    return sendSuccess(reply, {
      success: true,
      jobId,
      message: 'Message queued for delivery',
    }, 202);
  });

  app.post('/api/message/bulk', {
    preHandler: [apiKeyAuth, requirePermission('message:send')],
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
