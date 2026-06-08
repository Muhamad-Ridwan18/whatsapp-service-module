export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface DbClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
}
