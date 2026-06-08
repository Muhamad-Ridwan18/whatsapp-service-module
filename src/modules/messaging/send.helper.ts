import type { ApiKeyRow } from '../../types/index.js';
import { sessionRepository } from '../../services/database/repositories/session.repository.js';
import { AppError, ERR } from '../../utils/errors.js';
import { inferMediaType } from './infer-media-type.js';
import { sendMessageSchema } from './message.schema.js';
import type { z } from 'zod';

export interface SendFileAttachment {
  buffer: Buffer;
  filename?: string;
  mimetype?: string;
}

export type ParsedSendMessage = z.infer<typeof sendMessageSchema> & {
  mediaBuffer?: Buffer;
};

/** Session untuk API key — 1 akun = 1 nomor = 1 session. */
export async function resolveSessionForApiKey(apiKey: ApiKeyRow): Promise<string> {
  const bound = await sessionRepository.findByApiKeyId(apiKey.id);
  if (!bound) {
    throw new AppError(
      'Session belum ada. Login dashboard dengan nomor WhatsApp dan scan QR.',
      ERR.VALIDATION,
      422,
    );
  }
  return bound.session_id;
}

export async function parseSendRequestBody(
  input: unknown,
  apiKey: ApiKeyRow,
  file?: SendFileAttachment,
): Promise<ParsedSendMessage> {
  const raw = (input && typeof input === 'object')
    ? (input as Record<string, unknown>)
    : {};

  const boundSessionId = await resolveSessionForApiKey(apiKey);

  const parsed = sendMessageSchema.parse({
    ...raw,
    sessionId: boundSessionId,
  });

  if (!file) {
    return parsed;
  }

  const mediaType = inferMediaType({
    type: parsed.type,
    fileName: parsed.fileName ?? file.filename,
    mimetype: parsed.mimetype ?? file.mimetype,
    mediaUrl: parsed.mediaUrl,
  });

  return {
    ...parsed,
    mediaBuffer: file.buffer,
    fileName: parsed.fileName ?? file.filename ?? 'file',
    mimetype: parsed.mimetype ?? file.mimetype ?? 'application/octet-stream',
    type: mediaType === 'text' ? 'document' : mediaType,
  };
}
