import type { SessionRow, SessionStatus } from '../../../types/index.js';
import { db } from '../index.js';
import { dbNow } from '../sql.js';

export const sessionRepository = {
  async findBySessionId(sessionId: string): Promise<SessionRow | undefined> {
    return db.get<SessionRow>('SELECT * FROM sessions WHERE session_id = ?', [sessionId]);
  },

  async list(): Promise<SessionRow[]> {
    return db.all<SessionRow>('SELECT * FROM sessions ORDER BY created_at DESC');
  },

  async findByUserId(userId: number): Promise<SessionRow | undefined> {
    return db.get<SessionRow>(
      'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
  },

  async listByUserId(userId: number): Promise<SessionRow[]> {
    const row = await this.findByUserId(userId);
    return row ? [row] : [];
  },

  async findByApiKeyId(apiKeyId: number): Promise<SessionRow | undefined> {
    return db.get<SessionRow>(
      'SELECT * FROM sessions WHERE api_key_id = ? ORDER BY created_at DESC LIMIT 1',
      [apiKeyId],
    );
  },

  async listByApiKeyId(apiKeyId: number): Promise<SessionRow[]> {
    const bound = await this.findByApiKeyId(apiKeyId);
    return bound ? [bound] : [];
  },

  async bindApiKey(sessionId: string, apiKeyId: number): Promise<void> {
    await db.run('UPDATE sessions SET api_key_id = ?, updated_at = ? WHERE session_id = ?', [
      apiKeyId,
      dbNow(),
      sessionId,
    ]);
  },

  async transferApiKeyBindings(fromApiKeyId: number, toApiKeyId: number): Promise<void> {
    await db.run(
      'UPDATE sessions SET api_key_id = ?, updated_at = ? WHERE api_key_id = ?',
      [toApiKeyId, dbNow(), fromApiKeyId],
    );
  },

  async count(): Promise<number> {
    const row = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM sessions');
    return row?.c ?? 0;
  },

  async countByStatus(status: SessionStatus): Promise<number> {
    const row = await db.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM sessions WHERE status = ?',
      [status],
    );
    return row?.c ?? 0;
  },

  async findByPhoneNumber(phoneNumber: string): Promise<SessionRow | undefined> {
    return db.get<SessionRow>('SELECT * FROM sessions WHERE phone_number = ?', [phoneNumber]);
  },

  async create(data: {
    session_id: string;
    user_id?: number | null;
    api_key_id?: number | null;
    status?: SessionStatus;
    phone_number?: string | null;
  }): Promise<number> {
    const result = await db.run(
      `INSERT INTO sessions (session_id, user_id, api_key_id, status, phone_number) VALUES (?, ?, ?, ?, ?)`,
      [
        data.session_id,
        data.user_id ?? null,
        data.api_key_id ?? null,
        data.status ?? 'initializing',
        data.phone_number ?? null,
      ],
    );
    return result.lastInsertRowid;
  },

  async setPhoneNumber(sessionId: string, phoneNumber: string): Promise<void> {
    await db.run('UPDATE sessions SET phone_number = ?, updated_at = ? WHERE session_id = ?', [
      phoneNumber,
      dbNow(),
      sessionId,
    ]);
  },

  async setOwner(sessionId: string, userId: number): Promise<void> {
    await db.run('UPDATE sessions SET user_id = ?, updated_at = ? WHERE session_id = ?', [
      userId,
      dbNow(),
      sessionId,
    ]);
  },

  async updateStatus(
    sessionId: string,
    status: SessionStatus,
    extra?: { phone_number?: string; display_name?: string },
  ): Promise<void> {
    const sets = ['status = ?', 'updated_at = ?'];
    const params: (string | null)[] = [status, dbNow()];

    if (extra?.phone_number) {
      sets.push('phone_number = ?');
      params.push(extra.phone_number);
    }
    if (extra?.display_name) {
      sets.push('display_name = ?');
      params.push(extra.display_name);
    }
    if (status === 'connected') {
      sets.push('last_connected_at = ?');
      params.push(dbNow());
    }

    params.push(sessionId);
    await db.run(`UPDATE sessions SET ${sets.join(', ')} WHERE session_id = ?`, params);
  },

  async delete(sessionId: string): Promise<void> {
    await db.run('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
  },
};
