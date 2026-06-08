import { describe, it, expect } from 'vitest';
import { decryptApiKey, encryptApiKey, generateApiKey, hashApiKey } from './crypto.js';

describe('generateApiKey', () => {
  it('generates token with max 15 characters', () => {
    const { key } = generateApiKey();
    expect(key.length).toBeLessThanOrEqual(15);
    expect(key.length).toBeGreaterThan(0);
  });

  it('uses safe characters only', () => {
    const { key } = generateApiKey();
    expect(key).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it('produces verifiable hash', () => {
    const { key, hash } = generateApiKey();
    expect(hashApiKey(key)).toBe(hash);
  });
});

describe('encryptApiKey', () => {
  it('round-trips api key storage', () => {
    const { key } = generateApiKey();
    const encrypted = encryptApiKey(key);
    expect(decryptApiKey(encrypted)).toBe(key);
  });

  it('returns null for invalid payload', () => {
    expect(decryptApiKey('invalid')).toBeNull();
    expect(decryptApiKey(null)).toBeNull();
  });
});
