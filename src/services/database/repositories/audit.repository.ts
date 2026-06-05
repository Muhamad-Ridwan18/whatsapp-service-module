import { db } from '../index.js';

export const auditRepository = {
  log(data: {
    user_id?: number | null;
    api_key_id?: number | null;
    action: string;
    resource?: string;
    ip_address?: string;
    user_agent?: string;
    metadata?: unknown;
  }): void {
    db.getDb()
      .prepare(
        `INSERT INTO audit_logs (user_id, api_key_id, action, resource, ip_address, user_agent, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.user_id ?? null,
        data.api_key_id ?? null,
        data.action,
        data.resource ?? null,
        data.ip_address ?? null,
        data.user_agent ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      );
  },

  recent(limit = 100) {
    return db
      .getDb()
      .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
      .all(limit);
  },
};
