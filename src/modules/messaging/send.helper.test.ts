import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiKeyRow, SessionRow } from '../../types/index.js';

const findByApiKeyId = vi.fn();

vi.mock('../../services/database/repositories/session.repository.js', () => ({
  sessionRepository: {
    findByApiKeyId,
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

  it('rejects when no session bound', async () => {
    findByApiKeyId.mockResolvedValue(undefined);
    await expect(resolveSessionForApiKey(apiKey)).rejects.toThrow('Session belum ada');
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
});
