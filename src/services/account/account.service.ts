import { apiKeyRepository } from '../database/repositories/api-key.repository.js';
import { sessionRepository } from '../database/repositories/session.repository.js';
import { userRepository } from '../database/repositories/user.repository.js';
import { sessionManager } from '../whatsapp/session-manager.js';
import { createApiKeyForUser } from '../auth/api-key.service.js';
import { hashPassword, generateApiKey } from '../../utils/crypto.js';
import { normalizePhoneDigits } from '../../utils/phone.js';
import { sessionIdFromPhone } from '../../utils/session-id.js';
import { AppError, ERR } from '../../utils/errors.js';
import type { ApiKeyRow, SessionRow, UserRow } from '../../types/index.js';

export function emailFromPhone(phone: string): string {
  return `${normalizePhoneDigits(phone)}@wsm.local`;
}

export interface AccountBundle {
  user: UserRow;
  apiKey: ApiKeyRow | undefined;
  session: SessionRow | undefined;
}

export async function getAccountBundle(userId: number): Promise<AccountBundle> {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User tidak ditemukan', ERR.NOT_FOUND, 404);
  }
  const apiKey = await apiKeyRepository.findActiveByUserId(userId);
  const session = await sessionRepository.findByUserId(userId);
  return { user, apiKey, session };
}

export async function assertPhoneAvailable(phone: string, exceptUserId?: number): Promise<string> {
  const normalized = normalizePhoneDigits(phone);
  if (normalized.length < 10) {
    throw new AppError('Nomor WhatsApp tidak valid', ERR.VALIDATION, 422);
  }

  const byUser = await userRepository.findByPhoneNumber(normalized);
  if (byUser && byUser.id !== exceptUserId) {
    throw new AppError('Nomor sudah terdaftar', ERR.SESSION_EXISTS, 409);
  }

  const bySession = await sessionRepository.findByPhoneNumber(normalized);
  if (bySession && bySession.user_id !== exceptUserId) {
    throw new AppError('Nomor sudah dipakai akun lain', ERR.SESSION_EXISTS, 409);
  }

  return normalized;
}

/** Daftar akun baru: 1 user + 1 API key + 1 session. */
export async function registerClientAccount(data: {
  phone: string;
  password: string;
  name: string;
}): Promise<{ userId: number; sessionId: string; apiKey: string; phone: string }> {
  const phone = await assertPhoneAvailable(data.phone);
  const sessionId = sessionIdFromPhone(phone);

  const passwordHash = await hashPassword(data.password);
  const userId = await userRepository.create({
    email: emailFromPhone(phone),
    phone_number: phone,
    password_hash: passwordHash,
    name: data.name.trim(),
    role: 'client',
  });

  const { apiKey } = await provisionBundleForUser(userId, phone, sessionId);
  return { userId, sessionId, apiKey, phone };
}

/** Super admin buat akun klien (tanpa password — set lewat reset). */
export async function createClientAccountByAdmin(data: {
  phone: string;
  name: string;
  password: string;
}): Promise<{ userId: number; sessionId: string }> {
  const phone = await assertPhoneAvailable(data.phone);
  const sessionId = sessionIdFromPhone(phone);
  const passwordHash = await hashPassword(data.password);

  const userId = await userRepository.create({
    email: emailFromPhone(phone),
    phone_number: phone,
    password_hash: passwordHash,
    name: data.name.trim(),
    role: 'client',
  });

  await provisionBundleForUser(userId, phone, sessionId);
  return { userId, sessionId };
}

async function provisionBundleForUser(
  userId: number,
  phone: string,
  sessionId: string,
  options?: { connect?: boolean },
): Promise<{ apiKey: string; apiKeyId: number }> {
  const existing = await sessionRepository.findByUserId(userId);
  if (existing) {
    throw new AppError('Akun sudah memiliki session', ERR.SESSION_EXISTS, 409);
  }

  const { id, apiKey } = await createApiKeyForUser(userId, {
    name: `WA ${phone}`,
    replaceExisting: false,
    permissions: ['message:send', 'session:read', 'session:manage'],
  });

  await sessionRepository.create({
    session_id: sessionId,
    user_id: userId,
    api_key_id: id,
    phone_number: phone,
    status: 'initializing',
  });

  if (options?.connect !== false) {
    await sessionManager.create(sessionId, {
      userId,
      apiKeyId: id,
      phoneNumber: phone,
    });
  }

  return { apiKey, apiKeyId: id };
}

/** Pastikan user punya session + API key (idempotent). */
export async function ensureUserBundle(
  userId: number,
  phone: string,
  options?: { connect?: boolean },
): Promise<{ sessionId: string; apiKey?: string }> {
  const normalized = normalizePhoneDigits(phone);
  if (normalized.length < 10) {
    throw new AppError('Nomor WhatsApp tidak valid', ERR.VALIDATION, 422);
  }

  const existing = await sessionRepository.findByUserId(userId);
  if (existing) {
    return { sessionId: existing.session_id };
  }

  const sessionId = sessionIdFromPhone(normalized);
  const { apiKey } = await provisionBundleForUser(userId, normalized, sessionId, options);
  return { sessionId, apiKey };
}

/** Regenerasi API key — session tetap sama. */
export async function rotateApiKey(userId: number): Promise<{ apiKey: string }> {
  const session = await sessionRepository.findByUserId(userId);
  if (!session) {
    throw new AppError('Belum ada session. Hubungkan WhatsApp dulu.', ERR.VALIDATION, 422);
  }

  await apiKeyRepository.deactivateAllByUserId(userId);
  const { key, hash, prefix } = generateApiKey();
  const newId = await apiKeyRepository.create({
    user_id: userId,
    key_hash: hash,
    key_prefix: prefix,
    name: `WA ${session.phone_number ?? session.session_id}`,
    permissions: JSON.stringify(['message:send', 'session:read', 'session:manage']),
  });

  await sessionRepository.bindApiKey(session.session_id, newId);
  return { apiKey: key };
}
