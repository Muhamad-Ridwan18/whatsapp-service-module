import type { SessionEventRow } from '../../../types/index.js';
import { db } from '../index.js';

export const sessionEventRepository = {
  async log(data: {
    session_id: string;
    event: string;
    status_code?: number | null;
    reason?: string | null;
    metadata?: unknown;
  }): Promise<void> {
    await db.run(
      `INSERT INTO session_events (session_id, event, status_code, reason, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.session_id,
        data.event,
        data.status_code ?? null,
        data.reason ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ],
    );
  },

  async recent(sessionId?: string, limit = 100): Promise<SessionEventRow[]> {
    if (sessionId) {
      return db.all<SessionEventRow>(
        'SELECT * FROM session_events WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
        [sessionId, limit],
      );
    }
    return db.all<SessionEventRow>(
      'SELECT * FROM session_events ORDER BY created_at DESC LIMIT ?',
      [limit],
    );
  },

  async recentSafe(sessionId?: string, limit = 100): Promise<SessionEventRow[]> {
    try {
      return await this.recent(sessionId, limit);
    } catch {
      return [];
    }
  },
};
