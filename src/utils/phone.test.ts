import { describe, it, expect } from 'vitest';
import { normalizePhone, toJid, formatDisplayPhone } from './phone.js';

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
});
