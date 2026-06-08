import { apiKeyRepository } from '../database/repositories/api-key.repository.js';
import { sessionRepository } from '../database/repositories/session.repository.js';
import { encryptApiKey, generateApiKey } from '../../utils/crypto.js';
import { AppError, ERR } from '../../utils/errors.js';

export interface CreateApiKeyInput {
  name: string;
  permissions?: string[];
  webhook_url?: string | null;
  webhook_events?: string[];
  ip_whitelist?: string | null;
  replaceExisting?: boolean;
}

const DEFAULT_PERMISSIONS = ['message:send', 'session:read', 'session:manage'];

export async function createApiKeyForUser(userId: number, input: CreateApiKeyInput) {
  const active = await apiKeyRepository.findActiveByUserId(userId);
  if (active && input.replaceExisting === false) {
    throw new AppError('Akun ini sudah memiliki API key aktif.', ERR.KEY_LIMIT, 409);
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
    key_encrypted: encryptApiKey(key),
    name: input.name,
    permissions: input.permissions
      ? JSON.stringify(input.permissions)
      : JSON.stringify(DEFAULT_PERMISSIONS),
    webhook_url: input.webhook_url,
    webhook_events: input.webhook_events
      ? JSON.stringify(input.webhook_events)
      : undefined,
    ip_whitelist: input.ip_whitelist,
  });

  if (previousKeyId) {
    const session = await sessionRepository.findByUserId(userId);
    if (session) {
      await sessionRepository.bindApiKey(session.session_id, id);
    }
  }

  return { id, apiKey: key, prefix, replaced: !!active };
}
