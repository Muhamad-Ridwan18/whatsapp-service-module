import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config/index.js';

const SALT_ROUNDS = 10;

/** Tanpa karakter ambigu (0/O, 1/l/I) — mudah diketik & disalin. */
const API_KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, String(hash).trim());
}

function randomApiKeySegment(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += API_KEY_CHARS[bytes[i]! % API_KEY_CHARS.length];
  }
  return out;
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const prefix = config.apiKey.prefix;
  const maxLength = config.apiKey.maxLength;

  if (prefix.length >= maxLength) {
    throw new Error(`API_KEY_PREFIX terlalu panjang (max ${maxLength - 1} karakter)`);
  }

  const randomLen = maxLength - prefix.length;
  const key = `${prefix}${randomApiKeySegment(randomLen)}`;
  const hash = hashApiKey(key);
  const displayPrefix = key.slice(0, Math.min(6, key.length));

  return { key, hash, prefix: displayPrefix };
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

const API_KEY_CIPHER = 'aes-256-gcm';

function apiKeyCipherKey(): Buffer {
  return crypto.createHash('sha256').update(`wsm:api-key:${config.jwt.secret}`).digest();
}

/** Simpan key terenkripsi agar bisa ditampilkan lagi di dashboard. */
export function encryptApiKey(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(API_KEY_CIPHER, apiKeyCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptApiKey(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(
      API_KEY_CIPHER,
      apiKeyCipherKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(24).toString('hex');
}
