import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { DbClient, RunResult } from './client.js';
import { sqliteMigrations } from './migrations.sqlite.js';
import { logger } from '../logger/index.js';

export class SqliteClient implements DbClient {
  private db!: Database.Database;

  constructor(private readonly dbPath: string) {}

  connect(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000');
    this.db.pragma('temp_store = MEMORY');
    this.runMigrations();
    logger.info({ path: this.dbPath, driver: 'sqlite' }, 'Database connected');
    return Promise.resolve();
  }

  close(): Promise<void> {
    if (this.db) {
      this.db.close();
      logger.info('Database closed');
    }
    return Promise.resolve();
  }

  get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return Promise.resolve(
      this.db.prepare(sql).get(...params) as T | undefined,
    );
  }

  all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return Promise.resolve(this.db.prepare(sql).all(...params) as T[]);
  }

  run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const result = this.db.prepare(sql).run(...params);
    return Promise.resolve({
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    });
  }

  exec(sql: string): Promise<void> {
    this.db.exec(sql);
    return Promise.resolve();
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const applied = new Set(
      this.db
        .prepare('SELECT version FROM migrations')
        .all()
        .map((r) => (r as { version: number }).version),
    );

    for (const migration of sqliteMigrations) {
      if (applied.has(migration.version)) continue;
      this.db.exec(migration.sql);
      this.db
        .prepare('INSERT OR IGNORE INTO migrations (version) VALUES (?)')
        .run(migration.version);
      logger.info({ version: migration.version, driver: 'sqlite' }, 'Migration applied');
    }
  }
}
