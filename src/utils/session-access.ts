import type { ApiKeyRow, SessionRow } from '../types/index.js';
import { sessionRepository } from '../services/database/repositories/session.repository.js';
import { AppError, ERR } from './errors.js';

export function canApiKeyAccessSession(
  apiKey: ApiKeyRow,
  session: SessionRow,
): boolean {
  return session.api_key_id === apiKey.id;
}

export function assertApiKeySessionAccess(
  apiKey: ApiKeyRow,
  sessionId: string,
): SessionRow {
  const session = sessionRepository.findBySessionId(sessionId);
  if (!session) {
    throw new AppError('Session tidak ditemukan', ERR.SESSION_NOT_FOUND, 404);
  }
  if (!canApiKeyAccessSession(apiKey, session)) {
    throw new AppError(
      'Session tidak termasuk akun API key ini',
      ERR.FORBIDDEN,
      403,
    );
  }
  return session;
}
