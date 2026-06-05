import type { SessionStatus } from '../types/index.js';

const SESSION_STATUS: Record<SessionStatus, { label: string; class: string }> = {
  connected: { label: 'Terhubung', class: 'badge-success' },
  qr_ready: { label: 'Siap Scan QR', class: 'badge-warn' },
  initializing: { label: 'Memulai...', class: 'badge-warn' },
  reconnecting: { label: 'Menghubungkan ulang', class: 'badge-warn' },
  disconnected: { label: 'Terputus', class: 'badge-muted' },
  failed: { label: 'Gagal', class: 'badge-error' },
};

export function sessionStatusLabel(status: string) {
  return SESSION_STATUS[status as SessionStatus] ?? { label: status, class: 'badge-muted' };
}

export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    client: 'Klien',
  };
  return map[role] ?? role;
}

export function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    'api.request': 'Permintaan API',
    'webhook.failed': 'Webhook gagal',
    'user.request': 'Akses pengguna',
  };
  return map[action] ?? action;
}
