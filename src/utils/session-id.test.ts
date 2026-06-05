import { describe, it, expect } from 'vitest';
import { normalizePhoneDigits, sessionIdFromPhone } from './session-id.js';

describe('session-id utils', () => {
  it('normalizes Indonesian phone', () => {
    expect(normalizePhoneDigits('08123456789')).toBe('628123456789');
    expect(normalizePhoneDigits('628123456789')).toBe('628123456789');
  });

  it('generates session id from phone', () => {
    expect(sessionIdFromPhone('628123456789')).toBe('wa-628123456789');
  });
});
