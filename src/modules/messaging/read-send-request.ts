import type { FastifyRequest } from 'fastify';
import type { SendFileAttachment } from './send.helper.js';

function fieldValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}

export async function readSendRequest(
  request: FastifyRequest,
): Promise<{ body: Record<string, unknown>; file?: SendFileAttachment }> {
  const contentType = request.headers['content-type'] ?? '';

  if (!contentType.includes('multipart/form-data')) {
    const raw = request.body;
    return {
      body: (raw && typeof raw === 'object')
        ? (raw as Record<string, unknown>)
        : {},
    };
  }

  const fields: Record<string, unknown> = {};
  let file: SendFileAttachment | undefined;

  const parts = request.parts();
  for await (const part of parts) {
    if (part.type === 'file') {
      if (part.fieldname === 'file' && !file) {
        file = {
          buffer: await part.toBuffer(),
          filename: part.filename,
          mimetype: part.mimetype,
        };
      }
      continue;
    }

    fields[part.fieldname] = part.value;
  }

  return { body: fields, file };
}

export function normalizeUrlFields(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  for (const key of ['url', 'mediaUrl'] as const) {
    const val = fieldValue(out[key]);
    if (val && !val.startsWith('http')) {
      out[key] = `https://${val}`;
    }
  }
  return out;
}
