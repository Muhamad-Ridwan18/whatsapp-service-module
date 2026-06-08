import { config } from '../../config/index.js';
import type { ApiKeyRow, WebhookEvent } from '../../types/index.js';
import { sleep } from '../../utils/delay.js';
import { db } from '../database/index.js';
import { auditRepository } from '../database/repositories/audit.repository.js';
import { sessionRepository } from '../database/repositories/session.repository.js';
import { webhookLogger } from '../logger/index.js';

interface WebhookPayload {
  event: WebhookEvent;
  sessionId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

class WebhookService {
  private static instance: WebhookService;

  private constructor() {}

  static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  private async getKeysForSession(sessionId: string): Promise<ApiKeyRow[]> {
    const session = await sessionRepository.findBySessionId(sessionId);
    if (!session) return [];

    return db.all<ApiKeyRow>(
      `SELECT * FROM api_keys
       WHERE is_active = 1
         AND webhook_url IS NOT NULL
         AND (
           id = ?
           OR user_id = ?
         )`,
      [session.api_key_id ?? -1, session.user_id ?? -1],
    );
  }

  async dispatch(
    event: WebhookEvent,
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const keys = await this.getKeysForSession(sessionId);

    for (const key of keys) {
      let events: WebhookEvent[] = [];
      try {
        events = JSON.parse(key.webhook_events ?? '[]') as WebhookEvent[];
      } catch {
        continue;
      }

      if (!events.includes(event) || !key.webhook_url) continue;

      const payload: WebhookPayload = {
        event,
        sessionId,
        timestamp: new Date().toISOString(),
        data,
      };

      void this.sendWithRetry(key.webhook_url, payload, key.id);
    }
  }

  private async sendWithRetry(
    url: string,
    payload: WebhookPayload,
    apiKeyId: number,
  ): Promise<void> {
    for (let attempt = 1; attempt <= config.webhook.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          config.webhook.timeoutMs,
        );

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': payload.event,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          webhookLogger.info(
            { url, event: payload.event, attempt },
            'Webhook delivered',
          );
          return;
        }

        webhookLogger.warn(
          { url, status: res.status, attempt },
          'Webhook failed',
        );
      } catch (err) {
        webhookLogger.error({ url, attempt, err }, 'Webhook error');
      }

      if (attempt < config.webhook.maxRetries) {
        await sleep(1000 * attempt);
      }
    }

    void auditRepository.log({
      api_key_id: apiKeyId,
      action: 'webhook.failed',
      resource: url,
      metadata: payload,
    });
  }
}

export const webhookService = WebhookService.getInstance();
