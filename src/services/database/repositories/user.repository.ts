import type { UserRole, UserRow } from '../../../types/index.js';
import { db } from '../index.js';

export const userRepository = {
  findByEmail(email: string): UserRow | undefined {
    return db
      .getDb()
      .prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
      .get(email) as UserRow | undefined;
  },

  findById(id: number): UserRow | undefined {
    return db
      .getDb()
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as UserRow | undefined;
  },

  count(): number {
    const row = db.getDb().prepare('SELECT COUNT(*) as c FROM users').get() as {
      c: number;
    };
    return row.c;
  },

  create(data: {
    email: string;
    password_hash: string;
    name: string;
    role: UserRole;
  }): number {
    const result = db
      .getDb()
      .prepare(
        `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)`,
      )
      .run(data.email, data.password_hash, data.name, data.role);
    return Number(result.lastInsertRowid);
  },

  list(): UserRow[] {
    return db.getDb().prepare('SELECT * FROM users ORDER BY id').all() as UserRow[];
  },
};
