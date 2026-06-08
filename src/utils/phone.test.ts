import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  normalizePhoneDigits,
  normalizeCountryCode,
  resolvePhoneNumber,
  toJid,
  formatDisplayPhone,
  phoneFromWaJid,
  phonesMatch,
} from './phone.js';

describe('phone utils', () => {
  it('normalizes Indonesian number starting with 0', () => {
    expect(normalizePhone('08123456789')).toBe('628123456789@s.whatsapp.net');
  });

  it('normalizes plain number', () => {
    expect(normalizePhone('628123456789')).toBe('628123456789@s.whatsapp.net');
  });

  it('toJid returns jid format', () => {
    expect(toJid('628123456789')).toContain('@s.whatsapp.net');
  });

  it('formatDisplayPhone strips suffix', () => {
    expect(formatDisplayPhone('628123456789@s.whatsapp.net')).toBe('628123456789');
  });

  it('phoneFromWaJid ignores device suffix', () => {
    expect(phoneFromWaJid('62881081871528:0@s.whatsapp.net')).toBe('62881081871528');
    expect(phoneFromWaJid('62881081871528:12@s.whatsapp.net')).toBe('62881081871528');
  });

  it('phonesMatch tolerates 62 vs local format', () => {
    expect(phonesMatch('62881081871528', '62881081871528')).toBe(true);
    expect(phonesMatch('62881081871528', '0881081871528')).toBe(true);
    expect(phonesMatch('62881081871528', '881081871528')).toBe(true);
    expect(phonesMatch('62881081871528', '628999999999')).toBe(false);
  });

  it('normalizePhoneDigits handles 0 prefix', () => {
    expect(normalizePhoneDigits('08123456789')).toBe('628123456789');
    expect(normalizePhoneDigits('628123456789')).toBe('628123456789');
  });

  it('normalizeCountryCode strips non-digits', () => {
    expect(normalizeCountryCode('+62')).toBe('62');
    expect(normalizeCountryCode('62')).toBe('62');
  });

  it('resolvePhoneNumber from `to`', () => {
    expect(resolvePhoneNumber({ to: '628987654321' })).toBe('628987654321');
    expect(resolvePhoneNumber({ to: '08987654321' })).toBe('628987654321');
  });

  it('resolvePhoneNumber from target + countryCode (Fonnte style)', () => {
    expect(resolvePhoneNumber({ target: '08987654321', countryCode: '62' })).toBe('628987654321');
    expect(resolvePhoneNumber({ target: '8987654321', countryCode: '+62' })).toBe('628987654321');
    expect(resolvePhoneNumber({ target: '08123456789' })).toBe('628123456789');
  });

  it('resolvePhoneNumber throws without recipient', () => {
    expect(() => resolvePhoneNumber({})).toThrow('Nomor tujuan wajib');
  });
});
