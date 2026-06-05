import type { MessageRow, MessageType } from '../../../types/index.js';
import { db } from '../index.js';

export const messageRepository = {
  create(data: {
    session_id: string;
    message_id?: string | null;
    direction: 'inbound' | 'outbound';
    type: MessageType;
    to_number: string;
    from_number?: string | null;
    content?: string | null;
    media_url?: string | null;
    status?: string;
    api_key_id?: number | null;
  }): number {
    const result = db
      .getDb()
      .prepare(
        `INSERT INTO messages (session_id, message_id, direction, type, to_number, from_number, content, media_url, status, api_key_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.session_id,
        data.message_id ?? null,
        data.direction,
        data.type,
        data.to_number,
        data.from_number ?? null,
        data.content ?? null,
        data.media_url ?? null,
        data.status ?? 'pending',
        data.api_key_id ?? null,
      );
    return Number(result.lastInsertRowid);
  },

  updateStatus(id: number, status: string, messageId?: string): void {
    if (messageId) {
      db.getDb()
        .prepare(
          `UPDATE messages SET status = ?, message_id = ? WHERE id = ?`,
        )
        .run(status, messageId, id);
    } else {
      db.getDb()
        .prepare(`UPDATE messages SET status = ? WHERE id = ?`)
        .run(status, id);
    }
  },

  log(messageId: number, sessionId: string, event: string, payload?: unknown): void {
    db.getDb()
      .prepare(
        `INSERT INTO message_logs (message_id, session_id, event, payload) VALUES (?, ?, ?, ?)`,
      )
      .run(messageId, sessionId, event, payload ? JSON.stringify(payload) : null);
  },

  recent(limit = 50): MessageRow[] {
    return db
      .getDb()
      .prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?')
      .all(limit) as MessageRow[];
  },

  countToday(): number {
    const row = db
      .getDb()
      .prepare(
        `SELECT COUNT(*) as c FROM messages WHERE date(created_at) = date('now')`,
      )
      .get() as { c: number };
    return row.c;
  },
};
