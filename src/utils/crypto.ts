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

export function generateWebhookSecret(): string {
  return crypto.randomBytes(24).toString('hex');
}
