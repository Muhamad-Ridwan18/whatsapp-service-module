import type { UserRole, UserRow } from '../../../types/index.js';
import { db } from '../index.js';
import { dbNow } from '../sql.js';

export const userRepository = {
  async findByEmail(email: string): Promise<UserRow | undefined> {
    const normalized = email.trim().toLowerCase();
    return db.get<UserRow>(
      'SELECT * FROM users WHERE LOWER(TRIM(email)) = ? AND is_active = 1',
      [normalized],
    );
  },

  async findById(id: number): Promise<UserRow | undefined> {
    return db.get<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  },

  async count(): Promise<number> {
    const row = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM users');
    return row?.c ?? 0;
  },

  async create(data: {
    email: string;
    password_hash: string;
    name: string;
    role: UserRole;
  }): Promise<number> {
    const result = await db.run(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
      [data.email, data.password_hash, data.name, data.role],
    );
    return result.lastInsertRowid;
  },

  async list(): Promise<UserRow[]> {
    return db.all<UserRow>('SELECT * FROM users ORDER BY id');
  },

  async updatePassword(email: string, passwordHash: string): Promise<boolean> {
    const result = await db.run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE email = ?',
      [passwordHash, dbNow(), email],
    );
    return result.changes > 0;
  },

  async updateAdmin(
    email: string,
    data: { password_hash?: string; name?: string; new_email?: string },
  ): Promise<boolean> {
    const sets: string[] = ['updated_at = ?'];
    const params: string[] = [dbNow()];

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
    const result = await db.run(`UPDATE users SET ${sets.join(', ')} WHERE email = ?`, params);
    return result.changes > 0;
  },

  async deleteAll(): Promise<void> {
    await db.run('DELETE FROM users');
  },

  async deactivate(id: number): Promise<void> {
    await db.run('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?', [dbNow(), id]);
  },

  async createClient(data: {
    email: string;
    password_hash: string;
    name: string;
    role?: UserRole;
  }): Promise<number> {
    return this.create({
      email: data.email,
      password_hash: data.password_hash,
      name: data.name,
      role: data.role ?? 'client',
    });
  },
};
