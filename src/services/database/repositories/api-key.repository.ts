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

  findActiveByUserId(userId: number): ApiKeyRow | undefined {
    return db
      .getDb()
      .prepare('SELECT * FROM api_keys WHERE user_id = ? AND is_active = 1 LIMIT 1')
      .get(userId) as ApiKeyRow | undefined;
  },

  countActiveByUserId(userId: number): number {
    const row = db
      .getDb()
      .prepare('SELECT COUNT(*) as c FROM api_keys WHERE user_id = ? AND is_active = 1')
      .get(userId) as { c: number };
    return row.c;
  },

  deactivateAllByUserId(userId: number): void {
    db.getDb()
      .prepare(
        `UPDATE api_keys SET is_active = 0, updated_at = datetime('now') WHERE user_id = ? AND is_active = 1`,
      )
      .run(userId);
  },

  listAll(): ApiKeyRow[] {
    return db
      .getDb()
      .prepare('SELECT * FROM api_keys ORDER BY id DESC')
      .all() as ApiKeyRow[];
  },

  findByIdAndUserId(id: number, userId: number): ApiKeyRow | undefined {
    return db
      .getDb()
      .prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?')
      .get(id, userId) as ApiKeyRow | undefined;
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

  update(
    id: number,
    data: {
      webhook_url?: string | null;
      webhook_events?: string;
      ip_whitelist?: string | null;
      name?: string;
    },
  ): void {
    const sets: string[] = ["updated_at = datetime('now')"];
    const params: (string | null | number)[] = [];

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
    db.getDb()
      .prepare(`UPDATE api_keys SET ${sets.join(', ')} WHERE id = ?`)
      .run(...params);
  },
};
