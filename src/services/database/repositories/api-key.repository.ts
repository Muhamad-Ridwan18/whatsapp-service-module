import type { ApiKeyRow } from '../../../types/index.js';
import { db } from '../index.js';

export const apiKeyRepository = {
  findByHash(keyHash: string): ApiKeyRow | undefined {
    return db
      .getDb()
      .prepare('SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1')
      .get(keyHash) as ApiKeyRow | undefined;
  },

  findById(id: number): ApiKeyRow | undefined {
    return db
      .getDb()
      .prepare('SELECT * FROM api_keys WHERE id = ?')
      .get(id) as ApiKeyRow | undefined;
  },

  findByUserId(userId: number): ApiKeyRow[] {
    return db
      .getDb()
      .prepare('SELECT * FROM api_keys WHERE user_id = ? ORDER BY id DESC')
      .all(userId) as ApiKeyRow[];
  },

  create(data: {
    user_id: number;
    key_hash: string;
    key_prefix: string;
    name: string;
    permissions?: string;
    webhook_url?: string | null;
    webhook_events?: string;
    ip_whitelist?: string | null;
  }): number {
    const result = db
      .getDb()
      .prepare(
        `INSERT INTO api_keys (user_id, key_hash, key_prefix, name, permissions, webhook_url, webhook_events, ip_whitelist)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.user_id,
        data.key_hash,
        data.key_prefix,
        data.name,
        data.permissions ?? '["message:send","session:read"]',
        data.webhook_url ?? null,
        data.webhook_events ??
          '["message.received","message.sent","session.connected","session.disconnected"]',
        data.ip_whitelist ?? null,
      );
    return Number(result.lastInsertRowid);
  },

  updateLastUsed(id: number): void {
    db.getDb()
      .prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`)
      .run(id);
  },

  deactivate(id: number): void {
    db.getDb()
      .prepare(`UPDATE api_keys SET is_active = 0, updated_at = datetime('now') WHERE id = ?`)
      .run(id);
  },
};
