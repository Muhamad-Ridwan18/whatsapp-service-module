import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { messageQueue } from '../../services/queue/message-queue.js';
import type { MessagePayload } from '../../types/index.js';
import { sendSuccess } from '../../utils/response.js';
import { apiKeyAuth, requirePermission } from '../../middleware/auth.js';
import { z } from 'zod';
import { parseSendRequestBody } from './send.helper.js';
import type { ParsedSendMessage } from './send.helper.js';
import { normalizeUrlFields, readSendRequest } from './read-send-request.js';
import { assertApiKeySessionAccess } from '../../utils/session-access.js';

function toPayload(body: ParsedSendMessage): MessagePayload {
  return {
    type: body.type,
    message: body.message,
    mediaUrl: body.mediaUrl,
    mediaBuffer: body.mediaBuffer,
    caption: body.caption ?? body.message,
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
  const { body: rawBody, file } = await readSendRequest(request);
  const body = await parseSendRequestBody(
    normalizeUrlFields(rawBody),
    request.apiKey!,
    file,
  );

  await assertApiKeySessionAccess(request.apiKey!, body.sessionId);

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
      description: 'Alias Fonnte. Text: target+message. File: url (publik) atau upload field file (multipart).',
    },
  }, handleSendMessage);

  app.post('/api/message/bulk', {
    preHandler: sendHandlers,
    schema: { tags: ['Messaging'], security: [{ apiKey: [] }] },
  }, async (request, reply) => {
    const { messages: rawMessages } = z.object({
      messages: z.array(z.unknown()).min(1).max(100),
    }).parse(request.body);

    const messages = await Promise.all(
      rawMessages.map((msg) => parseSendRequestBody(msg, request.apiKey!)),
    );

    const jobIds = messageQueue.enqueueBulk(
      messages,
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
