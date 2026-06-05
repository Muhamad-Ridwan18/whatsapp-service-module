import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/index.js';
import type { BulkMessageItem, MessagePayload, QueueJob } from '../../types/index.js';
import { randomDelay, sleep } from '../../utils/delay.js';
import { messageLogger } from '../logger/index.js';
import { sessionManager } from '../whatsapp/session-manager.js';

class MessageQueue {
  private static instance: MessageQueue;
  private pending: QueueJob[] = [];
  private failed: QueueJob[] = [];
  private processing = false;
  private cooldowns = new Map<string, number>();
  private activeCount = 0;

  private constructor() {}

  static getInstance(): MessageQueue {
    if (!MessageQueue.instance) {
      MessageQueue.instance = new MessageQueue();
    }
    return MessageQueue.instance;
  }

  enqueue(
    sessionId: string,
    to: string,
    payload: MessagePayload,
    options?: { priority?: number; apiKeyId?: number },
  ): string {
    const job: QueueJob = {
      id: uuidv4(),
      sessionId,
      to,
      payload,
      priority: options?.priority ?? 0,
      retries: 0,
      maxRetries: config.queue.maxRetries,
      apiKeyId: options?.apiKeyId,
      createdAt: Date.now(),
    };

    this.pending.push(job);
    this.pending.sort((a, b) => b.priority - a.priority);
    messageLogger.info({ jobId: job.id, sessionId, to }, 'Job enqueued');
    void this.process();
    return job.id;
  }

  enqueueBulk(items: BulkMessageItem[], apiKeyId?: number): string[] {
    return items.map((item) => {
      const payload: MessagePayload = {
        type: item.type ?? 'text',
        message: item.message,
        mediaUrl: item.mediaUrl,
        caption: item.caption,
        fileName: item.fileName,
        mimetype: item.mimetype,
        latitude: item.latitude,
        longitude: item.longitude,
        contactName: item.contactName,
        contactNumber: item.contactNumber,
      };
      return this.enqueue(item.sessionId, item.to, payload, {
        priority: item.priority,
        apiKeyId,
      });
    });
  }

  private canSendToNumber(number: string): boolean {
    const last = this.cooldowns.get(number);
    if (!last) return true;
    return Date.now() - last >= config.queue.cooldownMs;
  }

  private setCooldown(number: string): void {
    this.cooldowns.set(number, Date.now());
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (
      this.pending.length > 0 &&
      this.activeCount < config.queue.concurrency
    ) {
      const jobIndex = this.pending.findIndex((j) => this.canSendToNumber(j.to));
      if (jobIndex === -1) {
        await sleep(500);
        continue;
      }

      const job = this.pending.splice(jobIndex, 1)[0]!;
      this.activeCount++;

      void this.executeJob(job).finally(() => {
        this.activeCount--;
        if (this.pending.length > 0) void this.process();
      });

      const delay = randomDelay(
        config.queue.delayMinMs,
        config.queue.delayMaxMs,
      );
      await sleep(delay);
    }

    this.processing = false;
  }

  private async executeJob(job: QueueJob): Promise<void> {
    try {
      const messageId = await sessionManager.sendMessage(
        job.sessionId,
        job.to,
        job.payload,
      );
      this.setCooldown(job.to);
      messageLogger.info(
        { jobId: job.id, messageId, sessionId: job.sessionId },
        'Message sent',
      );
    } catch (err) {
      job.retries++;
      messageLogger.error({ jobId: job.id, err, retries: job.retries }, 'Send failed');

      if (job.retries < job.maxRetries) {
        this.pending.push(job);
        this.pending.sort((a, b) => b.priority - a.priority);
      } else {
        this.failed.push(job);
        messageLogger.error({ jobId: job.id }, 'Job moved to failed queue');
      }
    }
  }

  getStats() {
    return {
      pending: this.pending.length,
      failed: this.failed.length,
      active: this.activeCount,
    };
  }

  getFailed(): QueueJob[] {
    return [...this.failed];
  }

  retryFailed(jobId: string): boolean {
    const idx = this.failed.findIndex((j) => j.id === jobId);
    if (idx === -1) return false;
    const job = this.failed.splice(idx, 1)[0]!;
    job.retries = 0;
    this.pending.push(job);
    void this.process();
    return true;
  }
}

export const messageQueue = MessageQueue.getInstance();
