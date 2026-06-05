import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config/index.js';
import { migrations } from './migrations.js';
import { logger } from '../logger/index.js';

class DatabaseService {
  private static instance: DatabaseService;
  private db!: Database.Database;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  connect(): Database.Database {
    if (this.db) return this.db;

    const dir = path.dirname(config.database.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(config.database.path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000');
    this.db.pragma('temp_store = MEMORY');

    this.runMigrations();
    logger.info({ path: config.database.path }, 'Database connected');
    return this.db;
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

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      this.db.exec(migration.sql);
      this.db
        .prepare('INSERT OR IGNORE INTO migrations (version) VALUES (?)')
        .run(migration.version);
      logger.info({ version: migration.version }, 'Migration applied');
    }
  }

  getDb(): Database.Database {
    return this.connect();
  }

  close(): void {
    if (this.db) {
      this.db.close();
      logger.info('Database closed');
    }
  }
}

export const db = DatabaseService.getInstance();
