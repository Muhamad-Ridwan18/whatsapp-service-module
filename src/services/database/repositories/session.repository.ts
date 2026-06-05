import type { SessionRow, SessionStatus } from '../../../types/index.js';
import { db } from '../index.js';

export const sessionRepository = {
  findBySessionId(sessionId: string): SessionRow | undefined {
    return db
      .getDb()
      .prepare('SELECT * FROM sessions WHERE session_id = ?')
      .get(sessionId) as SessionRow | undefined;
  },

  list(): SessionRow[] {
    return db
      .getDb()
      .prepare('SELECT * FROM sessions ORDER BY created_at DESC')
      .all() as SessionRow[];
  },

  count(): number {
    const row = db.getDb().prepare('SELECT COUNT(*) as c FROM sessions').get() as {
      c: number;
    };
    return row.c;
  },

  countByStatus(status: SessionStatus): number {
    const row = db
      .getDb()
      .prepare('SELECT COUNT(*) as c FROM sessions WHERE status = ?')
      .get(status) as { c: number };
    return row.c;
  },

  findByPhoneNumber(phoneNumber: string): SessionRow | undefined {
    return db
      .getDb()
      .prepare('SELECT * FROM sessions WHERE phone_number = ?')
      .get(phoneNumber) as SessionRow | undefined;
  },

  create(data: {
    session_id: string;
    user_id?: number | null;
    api_key_id?: number | null;
    status?: SessionStatus;
    phone_number?: string | null;
  }): number {
    const result = db
      .getDb()
      .prepare(
        `INSERT INTO sessions (session_id, user_id, api_key_id, status, phone_number) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        data.session_id,
        data.user_id ?? null,
        data.api_key_id ?? null,
        data.status ?? 'initializing',
        data.phone_number ?? null,
      );
    return Number(result.lastInsertRowid);
  },

  setPhoneNumber(sessionId: string, phoneNumber: string): void {
    db.getDb()
      .prepare(
        `UPDATE sessions SET phone_number = ?, updated_at = datetime('now') WHERE session_id = ?`,
      )
      .run(phoneNumber, sessionId);
  },

  updateStatus(
    sessionId: string,
    status: SessionStatus,
    extra?: { phone_number?: string; display_name?: string },
  ): void {
    const sets = ['status = ?', "updated_at = datetime('now')"];
    const params: (string | null)[] = [status];

    if (extra?.phone_number) {
      sets.push('phone_number = ?');
      params.push(extra.phone_number);
    }
    if (extra?.display_name) {
      sets.push('display_name = ?');
      params.push(extra.display_name);
    }
    if (status === 'connected') {
      sets.push("last_connected_at = datetime('now')");
    }

    params.push(sessionId);
    db.getDb()
      .prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE session_id = ?`)
      .run(...params);
  },

  delete(sessionId: string): void {
    db.getDb().prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
  },
};
