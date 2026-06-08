import { config } from '../../config/index.js';

export function dbNow(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function sqlTodayFilter(column: string): string {
  return config.database.driver === 'mysql'
    ? `DATE(${column}) = CURDATE()`
    : `date(${column}) = date('now')`;
}
