import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiKeyRow, SessionRow } from '../../types/index.js';

const findByApiKeyId = vi.fn();
const listByUserId = vi.fn();
const bindApiKey = vi.fn();

vi.mock('../../services/database/repositories/session.repository.js', () => ({
  sessionRepository: {
    findByApiKeyId,
    listByUserId,
    bindApiKey,
  },
}));

const { parseSendRequestBody, resolveSessionForApiKey } = await import('./send.helper.js');

const apiKey = { id: 10, user_id: 5 } as ApiKeyRow;

describe('resolveSessionForApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns session bound to API key', async () => {
    findByApiKeyId.mockResolvedValue({ session_id: 'wa-628111' } as SessionRow);
    await expect(resolveSessionForApiKey(apiKey)).resolves.toBe('wa-628111');
  });

  it('auto-binds single unbound user session', async () => {
    findByApiKeyId.mockResolvedValue(undefined);
    listByUserId.mockResolvedValue([
      { session_id: 'wa-628222', api_key_id: null },
    ] as SessionRow[]);

    await expect(resolveSessionForApiKey(apiKey)).resolves.toBe('wa-628222');
    expect(bindApiKey).toHaveBeenCalledWith('wa-628222', 10);
  });
});

describe('parseSendRequestBody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByApiKeyId.mockResolvedValue({ session_id: 'wa-628111' } as SessionRow);
  });

  it('parses Fonnte-style payload without sessionId', async () => {
    const result = await parseSendRequestBody(
      {
        target: '08123456789',
        countryCode: '62',
        message: 'halo',
      },
      apiKey,
    );
    expect(result.sessionId).toBe('wa-628111');
    expect(result.to).toBe('628123456789');
  });

  it('rejects sessionId that does not match API key', async () => {
    await expect(
      parseSendRequestBody(
        { sessionId: 'wa-other', target: '08111', countryCode: '62', message: 'x' },
        apiKey,
      ),
    ).rejects.toThrow('sessionId tidak cocok');
  });
});
