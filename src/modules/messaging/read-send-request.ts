import type { FastifyRequest } from 'fastify';
import { AppError, ERR } from '../../utils/errors.js';
import type { SendFileAttachment } from './send.helper.js';

function fieldValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}

function isMultipartRequest(request: FastifyRequest): boolean {
  if (typeof request.isMultipart === 'function') {
    return request.isMultipart();
  }
  const contentType = request.headers['content-type'] ?? '';
  return contentType.includes('multipart/form-data');
}

export async function readSendRequest(
  request: FastifyRequest,
): Promise<{ body: Record<string, unknown>; file?: SendFileAttachment }> {
  if (!isMultipartRequest(request)) {
    const raw = request.body;
    return {
      body: (raw && typeof raw === 'object')
        ? (raw as Record<string, unknown>)
        : {},
    };
  }

  if (typeof request.parts !== 'function') {
    throw new AppError(
      'Upload file belum aktif di server ini. Jalankan `npm install` lalu restart, atau gunakan field `url` (link publik).',
      ERR.VALIDATION,
      422,
    );
  }

  const fields: Record<string, unknown> = {};
  let file: SendFileAttachment | undefined;

  try {
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (part.fieldname === 'file' && !file && buffer.length > 0) {
          file = {
            buffer,
            filename: part.filename,
            mimetype: part.mimetype,
          };
        }
        continue;
      }

      if (part.type === 'field') {
        fields[part.fieldname] = String(part.value ?? '');
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal membaca upload file';
    if (msg.toLowerCase().includes('file size') || msg.toLowerCase().includes('limit')) {
      throw new AppError('File terlalu besar (maks 16MB)', ERR.VALIDATION, 413);
    }
    throw new AppError(`Upload gagal: ${msg}`, ERR.VALIDATION, 422);
  }

  if (!file) {
    throw new AppError(
      'Field `file` wajib untuk upload multipart, atau gunakan field `url` untuk link publik.',
      ERR.VALIDATION,
      422,
    );
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
