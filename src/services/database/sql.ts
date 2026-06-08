import { config } from '../../config/index.js';

export function dbNow(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function sqlTodayFilter(column: string): string {
  return config.database.driver === 'mysql'
    ? `DATE(${column}) = CURDATE()`
    : `date(${column}) = date('now')`;
}

/** MySQL prepared statement tidak mendukung LIMIT ? — inline integer aman. */
export function clampLimit(limit: number, max = 500): number {
  return Math.min(Math.max(Math.floor(limit), 1), max);
}
