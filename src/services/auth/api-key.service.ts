import { apiKeyRepository } from '../database/repositories/api-key.repository.js';
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

export function createApiKeyForUser(userId: number, input: CreateApiKeyInput) {
  const active = apiKeyRepository.findActiveByUserId(userId);
  if (active && input.replaceExisting === false) {
    throw new AppError(
      'Akun ini sudah memiliki API key aktif. Nonaktifkan dulu atau gunakan replace.',
      ERR.KEY_LIMIT,
      409,
    );
  }

  if (active) {
    apiKeyRepository.deactivateAllByUserId(userId);
  }

  const { key, hash, prefix } = generateApiKey();
  const id = apiKeyRepository.create({
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

  return { id, apiKey: key, prefix, replaced: !!active };
}
