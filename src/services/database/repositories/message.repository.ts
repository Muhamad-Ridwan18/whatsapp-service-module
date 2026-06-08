import type { MessageRow, MessageType } from '../../../types/index.js';
import { db } from '../index.js';
import { sqlTodayFilter } from '../sql.js';

export const messageRepository = {
  async create(data: {
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
  }): Promise<number> {
    const result = await db.run(
      `INSERT INTO messages (session_id, message_id, direction, type, to_number, from_number, content, media_url, status, api_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
      ],
    );
    return result.lastInsertRowid;
  },

  async updateStatus(id: number, status: string, messageId?: string): Promise<void> {
    if (messageId) {
      await db.run('UPDATE messages SET status = ?, message_id = ? WHERE id = ?', [
        status,
        messageId,
        id,
      ]);
    } else {
      await db.run('UPDATE messages SET status = ? WHERE id = ?', [status, id]);
    }
  },

  async log(
    messageId: number,
    sessionId: string,
    event: string,
    payload?: unknown,
  ): Promise<void> {
    await db.run(
      'INSERT INTO message_logs (message_id, session_id, event, payload) VALUES (?, ?, ?, ?)',
      [messageId, sessionId, event, payload ? JSON.stringify(payload) : null],
    );
  },

  async recent(limit = 50): Promise<MessageRow[]> {
    return db.all<MessageRow>('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?', [
      limit,
    ]);
  },

  async countToday(): Promise<number> {
    const row = await db.get<{ c: number }>(
      `SELECT COUNT(*) as c FROM messages WHERE ${sqlTodayFilter('created_at')}`,
    );
    return row?.c ?? 0;
  },
};
