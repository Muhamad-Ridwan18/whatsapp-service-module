import { describe, it, expect } from 'vitest';
import { canApiKeyAccessSession } from './session-access.js';
import type { ApiKeyRow, SessionRow } from '../types/index.js';

const apiKey = {
  id: 10,
  user_id: 5,
} as ApiKeyRow;

const sessionOwned = {
  session_id: 'wa-628111',
  user_id: 5,
  api_key_id: 10,
} as SessionRow;

const sessionOther = {
  session_id: 'wa-628222',
  user_id: 99,
  api_key_id: 20,
} as SessionRow;

describe('canApiKeyAccessSession', () => {
  it('allows session with matching api_key_id', () => {
    expect(canApiKeyAccessSession(apiKey, sessionOwned)).toBe(true);
  });

  it('allows session with matching user_id', () => {
    expect(canApiKeyAccessSession(apiKey, {
      ...sessionOwned,
      api_key_id: null,
    })).toBe(true);
  });

  it('denies session from another account', () => {
    expect(canApiKeyAccessSession(apiKey, sessionOther)).toBe(false);
  });
});
