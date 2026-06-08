import { apiKeyRepository } from '../database/repositories/api-key.repository.js';
import { sessionRepository } from '../database/repositories/session.repository.js';
import { generateApiKey } from '../../utils/crypto.js';
import { AppError, ERR } from '../../utils/errors.js';

export interface CreateApiKeyInput {
  name: string;
  permissions?: string[];
  webhook_url?: string | null;
  webhook_events?: string[];
  ip_whitelist?: string | null;
  /** true = nonaktifkan key lama lalu buat baru (default) */
  replaceExisting?: boolean;
}

export async function createApiKeyForUser(userId: number, input: CreateApiKeyInput) {
  const active = await apiKeyRepository.findActiveByUserId(userId);
  if (active && input.replaceExisting === false) {
    throw new AppError(
      'Akun ini sudah memiliki API key aktif. Nonaktifkan dulu atau gunakan replace.',
      ERR.KEY_LIMIT,
      409,
    );
  }

  const previousKeyId = active?.id;

  if (active) {
    await apiKeyRepository.deactivateAllByUserId(userId);
  }

  const { key, hash, prefix } = generateApiKey();
  const id = await apiKeyRepository.create({
    user_id: userId,
    key_hash: hash,
    key_prefix: prefix,
    name: input.name,
    permissions: input.permissions
      ? JSON.stringify(input.permissions)
      : undefined,
    webhook_url: input.webhook_url,
    webhook_events: input.webhook_events
      ? JSON.stringify(input.webhook_events)
      : undefined,
    ip_whitelist: input.ip_whitelist,
  });

  if (previousKeyId) {
    await sessionRepository.transferApiKeyBindings(previousKeyId, id);
  } else {
    const userSessions = await sessionRepository.listByUserId(userId);
    const unbound = userSessions.filter((s) => s.api_key_id == null);
    if (unbound.length === 1) {
      await sessionRepository.bindApiKey(unbound[0].session_id, id);
    }
  }

  return { id, apiKey: key, prefix, replaced: !!active };
}
