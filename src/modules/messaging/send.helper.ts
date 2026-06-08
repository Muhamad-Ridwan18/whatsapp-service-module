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

function pickString(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (typeof val === 'number') return String(val);
  }
  return undefined;
}

/** Session untuk API key — 1 key = 1 session, tanpa perlu kirim sessionId. */
export async function resolveSessionForApiKey(apiKey: ApiKeyRow): Promise<string> {
  const bound = await sessionRepository.findByApiKeyId(apiKey.id);
  if (bound) {
    return bound.session_id;
  }

  const userSessions = await sessionRepository.listByUserId(apiKey.user_id);
  const unbound = userSessions.filter((s) => s.api_key_id == null);

  if (unbound.length === 1) {
    await sessionRepository.bindApiKey(unbound[0].session_id, apiKey.id);
    return unbound[0].session_id;
  }

  if (userSessions.length === 0) {
    throw new AppError(
      'Belum ada session WhatsApp. Buat & scan QR di dashboard terlebih dahulu.',
      ERR.VALIDATION,
      422,
    );
  }

  throw new AppError(
    'Session belum terhubung ke API key ini. Hubungi admin atau buat session baru dari dashboard.',
    ERR.VALIDATION,
    422,
  );
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
  const requested = pickString(raw, 'sessionId', 'session');

  if (requested && requested !== boundSessionId) {
    throw new AppError(
      'sessionId tidak cocok dengan API key ini',
      ERR.FORBIDDEN,
      403,
    );
  }

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
