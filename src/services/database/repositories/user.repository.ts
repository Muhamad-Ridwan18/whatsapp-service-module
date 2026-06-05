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

  updatePassword(email: string, passwordHash: string): boolean {
    const result = db
      .getDb()
      .prepare(
        `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE email = ?`,
      )
      .run(passwordHash, email);
    return result.changes > 0;
  },

  updateAdmin(
    email: string,
    data: { password_hash?: string; name?: string; new_email?: string },
  ): boolean {
    const sets: string[] = ["updated_at = datetime('now')"];
    const params: string[] = [];

    if (data.password_hash) {
      sets.push('password_hash = ?');
      params.push(data.password_hash);
    }
    if (data.name) {
      sets.push('name = ?');
      params.push(data.name);
    }
    if (data.new_email) {
      sets.push('email = ?');
      params.push(data.new_email);
    }

    params.push(email);
    const result = db
      .getDb()
      .prepare(`UPDATE users SET ${sets.join(', ')} WHERE email = ?`)
      .run(...params);
    return result.changes > 0;
  },

  deleteAll(): void {
    db.getDb().prepare('DELETE FROM users').run();
  },

  deactivate(id: number): void {
    db.getDb()
      .prepare(`UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE id = ?`)
      .run(id);
  },

  createClient(data: {
    email: string;
    password_hash: string;
    name: string;
    role?: UserRole;
  }): number {
    return this.create({
      email: data.email,
      password_hash: data.password_hash,
      name: data.name,
      role: data.role ?? 'client',
    });
  },
};
