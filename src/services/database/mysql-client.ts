import type { ExecuteValues } from 'mysql2';
import mysql, { type Pool, type ResultSetHeader } from 'mysql2/promise';
import type { DbClient, RunResult } from './client.js';
import { mysqlMigrations } from './migrations.mysql.js';
import { config } from '../../config/index.js';
import { logger } from '../logger/index.js';

export class MysqlClient implements DbClient {
  private pool!: Pool;

  async connect(): Promise<void> {
    this.pool = mysql.createPool({
      host: config.database.mysql.host,
      port: config.database.mysql.port,
      user: config.database.mysql.user,
      password: config.database.mysql.password,
      database: config.database.mysql.database,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: '+00:00',
    });

    await this.pool.query('SELECT 1');
    await this.runMigrations();
    logger.info(
      { driver: 'mysql', database: config.database.mysql.database },
      'Database connected',
    );
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info('Database closed');
    }
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const [rows] = await this.pool.execute(sql, params as ExecuteValues);
    const list = rows as T[];
    return list[0];
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.pool.execute(sql, params as ExecuteValues);
    return rows as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const [result] = await this.pool.execute(sql, params as ExecuteValues);
    const header = result as ResultSetHeader;
    return {
      changes: header.affectedRows,
      lastInsertRowid: header.insertId,
    };
  }

  async exec(sql: string): Promise<void> {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      try {
        await this.pool.execute(statement);
      } catch (err) {
        const code = (err as { errno?: number }).errno;
        if (code === 1061) continue;
        throw err;
      }
    }
  }

  private async runMigrations(): Promise<void> {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INT PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [rows] = await this.pool.execute('SELECT version FROM migrations');
    const applied = new Set(
      (rows as { version: number }[]).map((r) => r.version),
    );

    for (const migration of mysqlMigrations) {
      if (applied.has(migration.version)) continue;
      await this.exec(migration.sql);
      await this.pool.execute(
        'INSERT IGNORE INTO migrations (version) VALUES (?)',
        [migration.version],
      );
      logger.info({ version: migration.version, driver: 'mysql' }, 'Migration applied');
    }
  }
}
