import { db } from '../index.js';
import { clampLimit } from '../sql.js';

export const auditRepository = {
  async log(data: {
    user_id?: number | null;
    api_key_id?: number | null;
    action: string;
    resource?: string;
    ip_address?: string;
    user_agent?: string;
    metadata?: unknown;
  }): Promise<void> {
    await db.run(
      `INSERT INTO audit_logs (user_id, api_key_id, action, resource, ip_address, user_agent, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.user_id ?? null,
        data.api_key_id ?? null,
        data.action,
        data.resource ?? null,
        data.ip_address ?? null,
        data.user_agent ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ],
    );
  },

  async recent(limit = 100) {
    const lim = clampLimit(limit);
    return db.all(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ${lim}`);
  },

  async recentSafe(limit = 100) {
    try {
      return await this.recent(limit);
    } catch {
      return [];
    }
  },
};
