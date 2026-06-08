import type { ApiKeyRow } from '../../../types/index.js';
import { db } from '../index.js';
import { dbNow } from '../sql.js';

export const apiKeyRepository = {
  async findByHash(keyHash: string): Promise<ApiKeyRow | undefined> {
    return db.get<ApiKeyRow>(
      'SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1',
      [keyHash],
    );
  },

  async findById(id: number): Promise<ApiKeyRow | undefined> {
    return db.get<ApiKeyRow>('SELECT * FROM api_keys WHERE id = ?', [id]);
  },

  async findByUserId(userId: number): Promise<ApiKeyRow[]> {
    return db.all<ApiKeyRow>(
      'SELECT * FROM api_keys WHERE user_id = ? ORDER BY id DESC',
      [userId],
    );
  },

  async findActiveByUserId(userId: number): Promise<ApiKeyRow | undefined> {
    return db.get<ApiKeyRow>(
      'SELECT * FROM api_keys WHERE user_id = ? AND is_active = 1 LIMIT 1',
      [userId],
    );
  },

  async countActiveByUserId(userId: number): Promise<number> {
    const row = await db.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM api_keys WHERE user_id = ? AND is_active = 1',
      [userId],
    );
    return row?.c ?? 0;
  },

  async deactivateAllByUserId(userId: number): Promise<void> {
    await db.run(
      'UPDATE api_keys SET is_active = 0, updated_at = ? WHERE user_id = ? AND is_active = 1',
      [dbNow(), userId],
    );
  },

  async listAll(): Promise<ApiKeyRow[]> {
    return db.all<ApiKeyRow>('SELECT * FROM api_keys ORDER BY id DESC');
  },

  async findByIdAndUserId(id: number, userId: number): Promise<ApiKeyRow | undefined> {
    return db.get<ApiKeyRow>(
      'SELECT * FROM api_keys WHERE id = ? AND user_id = ?',
      [id, userId],
    );
  },

  async create(data: {
    user_id: number;
    key_hash: string;
    key_prefix: string;
    key_encrypted?: string | null;
    name: string;
    permissions?: string;
    webhook_url?: string | null;
    webhook_events?: string;
    ip_whitelist?: string | null;
  }): Promise<number> {
    const result = await db.run(
      `INSERT INTO api_keys (user_id, key_hash, key_prefix, key_encrypted, name, permissions, webhook_url, webhook_events, ip_whitelist)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.user_id,
        data.key_hash,
        data.key_prefix,
        data.key_encrypted ?? null,
        data.name,
        data.permissions ?? '["message:send","session:read"]',
        data.webhook_url ?? null,
        data.webhook_events ??
          '["message.received","message.sent","session.connected","session.disconnected"]',
        data.ip_whitelist ?? null,
      ],
    );
    return result.lastInsertRowid;
  },

  async updateLastUsed(id: number): Promise<void> {
    await db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', [dbNow(), id]);
  },

  async deactivate(id: number): Promise<void> {
    await db.run('UPDATE api_keys SET is_active = 0, updated_at = ? WHERE id = ?', [
      dbNow(),
      id,
    ]);
  },

  async update(
    id: number,
    data: {
      webhook_url?: string | null;
      webhook_events?: string;
      ip_whitelist?: string | null;
      name?: string;
    },
  ): Promise<void> {
    const sets: string[] = ['updated_at = ?'];
    const params: (string | null | number)[] = [dbNow()];

    if (data.name !== undefined) {
      sets.push('name = ?');
      params.push(data.name);
    }
    if (data.webhook_url !== undefined) {
      sets.push('webhook_url = ?');
      params.push(data.webhook_url);
    }
    if (data.webhook_events !== undefined) {
      sets.push('webhook_events = ?');
      params.push(data.webhook_events);
    }
    if (data.ip_whitelist !== undefined) {
      sets.push('ip_whitelist = ?');
      params.push(data.ip_whitelist);
    }

    params.push(id);
    await db.run(`UPDATE api_keys SET ${sets.join(', ')} WHERE id = ?`, params);
  },
};
