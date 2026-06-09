import { config } from '../../config/index.js';
import { normalizePhoneDigits } from '../../utils/phone.js';
import { fonnteLogger } from '../logger/index.js';

export interface SessionFailureAlert {
  sessionId: string;
  phone: string;
  reason: string;
  statusCode?: number | null;
}

class FonnteService {
  private static instance: FonnteService;
  private lastAlertAt = new Map<string, number>();

  private constructor() {}

  static getInstance(): FonnteService {
    if (!FonnteService.instance) {
      FonnteService.instance = new FonnteService();
    }
    return FonnteService.instance;
  }

  isEnabled(): boolean {
    return config.fonnte.enabled;
  }

  clearCooldown(sessionId: string): void {
    this.lastAlertAt.delete(sessionId);
  }

  async notifyReconnectFailed(alert: SessionFailureAlert): Promise<void> {
    if (!this.isEnabled()) return;

    const phone = normalizePhoneDigits(alert.phone);
    if (phone.length < 10) {
      fonnteLogger.warn({ sessionId: alert.sessionId }, 'Fonnte alert skipped — nomor tidak valid');
      return;
    }

    const now = Date.now();
    const last = this.lastAlertAt.get(alert.sessionId);
    if (last && now - last < config.fonnte.cooldownMs) {
      fonnteLogger.info(
        { sessionId: alert.sessionId },
        'Fonnte alert skipped — masih dalam cooldown',
      );
      return;
    }

    const codeLine = alert.statusCode != null ? `\nKode error: ${alert.statusCode}` : '';
    const message =
      `⚠️ *WhatsApp Service Module*\n\n` +
      `Koneksi WhatsApp terputus dan *gagal reconnect* otomatis.\n\n` +
      `Session: ${alert.sessionId}\n` +
      `Nomor: ${phone}\n` +
      `Alasan: ${alert.reason}${codeLine}\n\n` +
      `Silakan buka dashboard dan scan QR ulang:\n` +
      `${config.baseUrl}/login`;

    try {
      const body = new URLSearchParams({
        target: phone,
        message,
        countryCode: '62',
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.fonnte.timeoutMs);

      const res = await fetch(config.fonnte.apiUrl, {
        method: 'POST',
        headers: { Authorization: config.fonnte.token! },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const ok = res.ok && payload.reason !== 'token invalid';

      if (ok) {
        this.lastAlertAt.set(alert.sessionId, now);
        fonnteLogger.info({ sessionId: alert.sessionId, phone }, 'Fonnte alert terkirim');
      } else {
        fonnteLogger.error(
          { sessionId: alert.sessionId, status: res.status, payload },
          'Fonnte alert gagal',
        );
      }
    } catch (err) {
      fonnteLogger.error({ sessionId: alert.sessionId, err }, 'Fonnte alert error');
    }
  }
}

export const fonnteService = FonnteService.getInstance();
