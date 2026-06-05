import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { config } from '../../config/index.js';
import type { MessagePayload, SessionStatus } from '../../types/index.js';
import { AppError, ERR } from '../../utils/errors.js';
import { toJid, formatDisplayPhone } from '../../utils/phone.js';
import { sessionRepository } from '../database/repositories/session.repository.js';
import { messageRepository } from '../database/repositories/message.repository.js';
import { waLogger } from '../logger/index.js';
import { waEventBus } from './event-bus.js';
import { webhookService } from '../webhook/webhook.service.js';

interface SessionInstance {
  socket: WASocket | null;
  status: SessionStatus;
  qrBase64: string | null;
  reconnectAttempts: number;
  isConnecting: boolean;
}

class SessionManager {
  private static instance: SessionManager;
  private sessions = new Map<string, SessionInstance>();

  private constructor() {}

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  async restoreAll(): Promise<void> {
    const authDir = config.whatsapp.authPath;
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
      return;
    }

    const dirs = fs
      .readdirSync(authDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const dbSessions = sessionRepository.list().map((s) => s.session_id);
    const toRestore = [...new Set([...dirs, ...dbSessions])];

    waLogger.info({ count: toRestore.length }, 'Restoring sessions');

    for (const sessionId of toRestore) {
      if (!sessionRepository.findBySessionId(sessionId)) {
        sessionRepository.create({ session_id: sessionId, status: 'initializing' });
      }
      await this.connect(sessionId).catch((err) => {
        waLogger.error({ sessionId, err }, 'Failed to restore session');
      });
    }
  }

  async ensureConnection(sessionId: string, phoneNumber?: string): Promise<void> {
    const existing = sessionRepository.findBySessionId(sessionId);
    const inst = this.sessions.get(sessionId);
    const status = this.getStatus(sessionId);

    if (status === 'connected') return;
    if (inst?.isConnecting) return;

    if (!existing) {
      sessionRepository.create({
        session_id: sessionId,
        status: 'initializing',
        phone_number: phoneNumber ?? null,
      });
      await this.connect(sessionId);
      return;
    }

    if (status === 'failed' || status === 'disconnected') {
      if (inst) {
        inst.reconnectAttempts = 0;
        inst.isConnecting = false;
      }
      await this.connect(sessionId);
      return;
    }

    if (!inst?.socket) {
      await this.connect(sessionId);
    }
  }

  async create(
    sessionId: string,
    options?: { apiKeyId?: number; userId?: number; phoneNumber?: string },
  ): Promise<void> {
    const phoneNumber = options?.phoneNumber;

    if (phoneNumber) {
      const byPhone = sessionRepository.findByPhoneNumber(phoneNumber);
      if (byPhone && byPhone.session_id !== sessionId) {
        throw new AppError(
          `Nomor ${phoneNumber} sudah terdaftar pada session "${byPhone.session_id}"`,
          ERR.SESSION_EXISTS,
          409,
        );
      }
    }

    if (this.sessions.has(sessionId) && this.getStatus(sessionId) !== 'failed') {
      throw new AppError('Session already exists', ERR.SESSION_EXISTS, 409);
    }

    if (sessionRepository.count() >= config.whatsapp.maxSessions) {
      throw new AppError('Maximum sessions reached', ERR.SESSION_LIMIT, 403);
    }

    const existing = sessionRepository.findBySessionId(sessionId);
    if (!existing) {
      sessionRepository.create({
        session_id: sessionId,
        api_key_id: options?.apiKeyId ?? null,
        user_id: options?.userId ?? null,
        status: 'initializing',
        phone_number: phoneNumber ?? null,
      });
    } else if (phoneNumber) {
      sessionRepository.setPhoneNumber(sessionId, phoneNumber);
    }

    await this.connect(sessionId);
  }

  private getAuthPath(sessionId: string): string {
    const p = path.join(config.whatsapp.authPath, sessionId);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
  }

  private setStatus(sessionId: string, status: SessionStatus, extra?: {
    phone_number?: string;
    display_name?: string;
  }): void {
    const inst = this.sessions.get(sessionId) ?? {
      socket: null,
      status: 'initializing' as SessionStatus,
      qrBase64: null,
      reconnectAttempts: 0,
      isConnecting: false,
    };
    inst.status = status;
    this.sessions.set(sessionId, inst);
    sessionRepository.updateStatus(sessionId, status, extra);
    waEventBus.emitStatus(sessionId, status);
    waEventBus.emitLog(sessionId, `Status: ${status}`);
  }

  async connect(sessionId: string): Promise<void> {
    let inst = this.sessions.get(sessionId);
    if (inst?.isConnecting) return;

    if (!inst) {
      inst = {
        socket: null,
        status: 'initializing',
        qrBase64: null,
        reconnectAttempts: 0,
        isConnecting: false,
      };
      this.sessions.set(sessionId, inst);
    }

    if (inst.socket) {
      try {
        inst.socket.end(undefined);
      } catch {
        /* ignore */
      }
      inst.socket = null;
    }

    inst.isConnecting = true;
    inst.qrBase64 = null;
    this.setStatus(sessionId, 'initializing');

    try {
      const { version } = await fetchLatestBaileysVersion();
      const { state, saveCreds } = await useMultiFileAuthState(
        this.getAuthPath(sessionId),
      );

      const socket = makeWASocket({
        version,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined,
      });

      inst.socket = socket;

      socket.ev.on('creds.update', saveCreds);

      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          inst!.reconnectAttempts = 0;
          const qrBase64 = await QRCode.toDataURL(qr, { width: 256, margin: 1 });
          inst!.qrBase64 = qrBase64.replace(/^data:image\/png;base64,/, '');
          this.setStatus(sessionId, 'qr_ready');
          waEventBus.emitQr(sessionId, inst!.qrBase64);
          void webhookService.dispatch('qr.updated', sessionId, { qr: inst!.qrBase64 });
        }

        if (connection === 'open') {
          inst!.reconnectAttempts = 0;
          inst!.qrBase64 = null;
          const user = socket.user;
          const phone = user?.id ? formatDisplayPhone(user.id) : undefined;
          this.setStatus(sessionId, 'connected', {
            phone_number: phone,
            display_name: user?.name ?? undefined,
          });
          void webhookService.dispatch('session.connected', sessionId, {
            phone_number: phone,
          });
          waLogger.info({ sessionId, phone }, 'Session connected');
        }

        if (connection === 'close') {
          const statusCode = (
            lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
          )?.output?.statusCode;

          inst!.socket = null;
          inst!.isConnecting = false;

          void webhookService.dispatch('session.disconnected', sessionId, {
            reason: statusCode,
          });

          if (statusCode === DisconnectReason.loggedOut) {
            this.setStatus(sessionId, 'disconnected');
            waLogger.warn({ sessionId, statusCode }, 'Session logged out');
            return;
          }

          const restartRequired = statusCode === DisconnectReason.restartRequired;
          const inQrPhase =
            inst!.status === 'initializing' ||
            inst!.status === 'qr_ready' ||
            inst!.status === 'reconnecting';

          if (restartRequired || (inQrPhase && inst!.reconnectAttempts < 30)) {
            if (!restartRequired) inst!.reconnectAttempts++;
            this.setStatus(sessionId, inQrPhase ? 'qr_ready' : 'reconnecting');
            waLogger.warn(
              { sessionId, statusCode, attempt: inst!.reconnectAttempts, restartRequired },
              'Reconnecting session',
            );
            const delay = restartRequired ? 0 : config.whatsapp.reconnectIntervalMs;
            setTimeout(() => {
              void this.connect(sessionId);
            }, delay);
            return;
          }

          if (inst!.reconnectAttempts < config.whatsapp.maxReconnectAttempts) {
            inst!.reconnectAttempts++;
            this.setStatus(sessionId, 'reconnecting');
            waLogger.warn(
              { sessionId, statusCode, attempt: inst!.reconnectAttempts },
              'Reconnecting session',
            );
            setTimeout(() => {
              void this.connect(sessionId);
            }, config.whatsapp.reconnectIntervalMs);
            return;
          }

          waLogger.error({ sessionId, statusCode }, 'Session connection failed');
          this.setStatus(sessionId, 'failed');
        }
      });

      socket.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
        if (type !== 'notify') return;
        for (const msg of msgs) {
          await this.handleIncomingMessage(sessionId, msg);
        }
      });

      socket.ev.on('messages.update', (updates) => {
        for (const update of updates) {
          if (update.update?.status) {
            const statusMap: Record<number, string> = {
              2: 'sent',
              3: 'delivered',
              4: 'read',
            };
            const event = statusMap[update.update.status as number];
            if (event) {
              void webhookService.dispatch(
                `message.${event}` as 'message.sent',
                sessionId,
                { messageId: update.key.id },
              );
            }
          }
        }
      });
    } catch (err) {
      waLogger.error({ sessionId, err }, 'Connection failed');
      this.setStatus(sessionId, 'failed');
      throw err;
    } finally {
      inst.isConnecting = false;
    }
  }

  private async handleIncomingMessage(
    sessionId: string,
    msg: WAMessage,
  ): Promise<void> {
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid ?? '';
    const content =
      msg.message.conversation ??
      msg.message.extendedTextMessage?.text ??
      '[media]';

    const dbId = messageRepository.create({
      session_id: sessionId,
      message_id: msg.key.id ?? null,
      direction: 'inbound',
      type: 'text',
      to_number: formatDisplayPhone(from),
      from_number: formatDisplayPhone(from),
      content,
      status: 'received',
    });

    messageRepository.log(dbId, sessionId, 'received', { content });

    void webhookService.dispatch('message.received', sessionId, {
      from: formatDisplayPhone(from),
      messageId: msg.key.id,
      content,
      timestamp: msg.messageTimestamp,
    });
  }

  getStatus(sessionId: string): SessionStatus {
    return (
      this.sessions.get(sessionId)?.status ??
      sessionRepository.findBySessionId(sessionId)?.status ??
      'disconnected'
    );
  }

  getQr(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.qrBase64 ?? null;
  }

  getSocket(sessionId: string): WASocket | null {
    const inst = this.sessions.get(sessionId);
    if (!inst?.socket || inst.status !== 'connected') return null;
    return inst.socket;
  }

  async sendMessage(
    sessionId: string,
    to: string,
    payload: MessagePayload,
  ): Promise<string> {
    const socket = this.getSocket(sessionId);
    if (!socket) {
      throw new AppError('Session not connected', ERR.SESSION_NOT_CONNECTED, 400);
    }

    const jid = toJid(to);
    let result: WAMessage | undefined;

    switch (payload.type) {
      case 'text':
        result = await socket.sendMessage(jid, {
          text: payload.message ?? '',
        });
        break;
      case 'image':
        result = await socket.sendMessage(jid, {
          image: { url: payload.mediaUrl! },
          caption: payload.caption,
        });
        break;
      case 'document':
        result = await socket.sendMessage(jid, {
          document: { url: payload.mediaUrl! },
          mimetype: payload.mimetype ?? 'application/pdf',
          fileName: payload.fileName ?? 'document',
        });
        break;
      case 'audio':
        result = await socket.sendMessage(jid, {
          audio: { url: payload.mediaUrl! },
          mimetype: payload.mimetype ?? 'audio/mpeg',
        });
        break;
      case 'video':
        result = await socket.sendMessage(jid, {
          video: { url: payload.mediaUrl! },
          caption: payload.caption,
        });
        break;
      case 'location':
        result = await socket.sendMessage(jid, {
          location: {
            degreesLatitude: payload.latitude!,
            degreesLongitude: payload.longitude!,
          },
        });
        break;
      case 'contact':
        result = await socket.sendMessage(jid, {
          contacts: {
            displayName: payload.contactName ?? 'Contact',
            contacts: [{ vcard: `BEGIN:VCARD\nFN:${payload.contactName}\nTEL:${payload.contactNumber}\nEND:VCARD` }],
          },
        });
        break;
      default:
        result = await socket.sendMessage(jid, { text: payload.message ?? '' });
    }

    if (!result) {
      throw new AppError('Failed to send message', ERR.MESSAGE_FAILED, 500);
    }

    const messageId = result.key.id ?? `local-${Date.now()}`;
    const dbId = messageRepository.create({
      session_id: sessionId,
      message_id: messageId,
      direction: 'outbound',
      type: payload.type,
      to_number: to,
      content: payload.message ?? payload.caption ?? null,
      media_url: payload.mediaUrl ?? null,
      status: 'sent',
    });

    messageRepository.log(dbId, sessionId, 'sent');
    void webhookService.dispatch('message.sent', sessionId, {
      to,
      messageId,
      type: payload.type,
    });

    return messageId;
  }

  async disconnect(sessionId: string): Promise<void> {
    const inst = this.sessions.get(sessionId);
    if (inst?.socket) {
      inst.socket.end(undefined);
      inst.socket = null;
    }
    this.setStatus(sessionId, 'disconnected');
  }

  async restart(sessionId: string): Promise<void> {
    const inst = this.sessions.get(sessionId);
    if (inst?.socket) {
      try {
        inst.socket.end(undefined);
      } catch {
        /* ignore */
      }
      inst.socket = null;
    }
    if (inst) {
      inst.reconnectAttempts = 0;
      inst.isConnecting = false;
      inst.qrBase64 = null;
    }
    await this.connect(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.disconnect(sessionId);
    this.sessions.delete(sessionId);
    sessionRepository.delete(sessionId);

    const authPath = this.getAuthPath(sessionId);
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
    }
  }

  listSessions(): Record<string, SessionStatus> {
    const result: Record<string, SessionStatus> = {};
    for (const [id, inst] of this.sessions) {
      result[id] = inst.status;
    }
    const dbSessions = sessionRepository.list();
    for (const s of dbSessions) {
      if (!result[s.session_id]) {
        result[s.session_id] = s.status;
      }
    }
    return result;
  }

  getConnectedCount(): number {
    let count = 0;
    for (const inst of this.sessions.values()) {
      if (inst.status === 'connected') count++;
    }
    return count;
  }
}

export const sessionManager = SessionManager.getInstance();
