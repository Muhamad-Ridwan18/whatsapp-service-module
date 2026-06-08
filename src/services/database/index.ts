import { config } from '../../config/index.js';
import type { DbClient } from './client.js';
import { MysqlClient } from './mysql-client.js';
import { SqliteClient } from './sqlite-client.js';

class DatabaseService {
  private static instance: DatabaseService;
  private client!: DbClient;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async connect(): Promise<void> {
    if (this.client) return;

    this.client =
      config.database.driver === 'mysql'
        ? new MysqlClient()
        : new SqliteClient(config.database.path);

    await this.client.connect();
  }

  get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.client.get<T>(sql, params);
  }

  all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.client.all<T>(sql, params);
  }

  run(sql: string, params: unknown[] = []): Promise<import('./client.js').RunResult> {
    return this.client.run(sql, params);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }
}

export const db = DatabaseService.getInstance();
