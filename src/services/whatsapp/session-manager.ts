import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
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
import { formatDisplayPhone, normalizePhoneDigits, phoneFromWaJid, phonesMatch } from '../../utils/phone.js';
import { sessionRepository } from '../database/repositories/session.repository.js';
import { sessionEventRepository } from '../database/repositories/session-event.repository.js';
import { messageRepository } from '../database/repositories/message.repository.js';
import { waLogger } from '../logger/index.js';
import { waEventBus } from './event-bus.js';
import { fonnteService } from '../notification/fonnte.service.js';
import { webhookService } from '../webhook/webhook.service.js';
import { waMessageStore } from './message-store.js';
import { resolveRecipientJid } from './resolve-recipient.js';

interface SessionInstance {
  socket: WASocket | null;
  status: SessionStatus;
  qrBase64: string | null;
  /** Raw QR string terakhir — hindari re-encode & emit duplikat. */
  lastQrRaw: string | null;
  reconnectAttempts: number;
  isConnecting: boolean;
}

class SessionManager {
  private static instance: SessionManager;
  private sessions = new Map<string, SessionInstance>();
  private statusCache = new Map<string, SessionStatus>();

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

    const authFolders = fs
      .readdirSync(authDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const dbSessions = await sessionRepository.list();
    for (const session of dbSessions) {
      this.statusCache.set(session.session_id, session.status);
    }

    for (const folder of authFolders) {
      if (!(await sessionRepository.findBySessionId(folder))) {
        const orphanPath = path.join(authDir, folder);
        waLogger.warn({ sessionId: folder }, 'Folder auth yatim — dibersihkan (session sudah dihapus)');
        try {
          fs.rmSync(orphanPath, { recursive: true, force: true });
        } catch (err) {
          waLogger.error({ sessionId: folder, err }, 'Gagal hapus folder auth yatim');
        }
      }
    }

    waLogger.info({ count: dbSessions.length }, 'Restoring sessions from database');

    for (const session of dbSessions) {
      await this.connect(session.session_id).catch((err) => {
        waLogger.error({ sessionId: session.session_id, err }, 'Failed to restore session');
      });
    }
  }

  async ensureConnection(sessionId: string, phoneNumber?: string): Promise<void> {
    const existing = await sessionRepository.findBySessionId(sessionId);
    const inst = this.sessions.get(sessionId);
    const status = this.getStatus(sessionId);

    if (status === 'connected') return;
    if (inst?.isConnecting) return;

    if (!existing) {
      await sessionRepository.create({
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

    if (options?.userId) {
      const byUser = await sessionRepository.findByUserId(options.userId);
      if (byUser && byUser.session_id !== sessionId) {
        throw new AppError(
          'Satu akun hanya boleh punya satu session WhatsApp',
          ERR.SESSION_LIMIT,
          403,
        );
      }
    }

    if (phoneNumber) {
      const byPhone = await sessionRepository.findByPhoneNumber(phoneNumber);
      if (byPhone && byPhone.session_id !== sessionId) {
        if (
          options?.userId &&
          byPhone.user_id &&
          byPhone.user_id !== options.userId
        ) {
          throw new AppError(
            `Nomor ${phoneNumber} sudah digunakan akun lain`,
            ERR.FORBIDDEN,
            403,
          );
        }
        throw new AppError(
          `Nomor ${phoneNumber} sudah terdaftar pada session "${byPhone.session_id}"`,
          ERR.SESSION_EXISTS,
          409,
        );
      }
    }

    const existingBeforeCreate = await sessionRepository.findBySessionId(sessionId);
    if (existingBeforeCreate?.user_id && options?.userId &&
        existingBeforeCreate.user_id !== options.userId) {
      throw new AppError('Session milik akun lain', ERR.FORBIDDEN, 403);
    }

    const inMemory = this.sessions.has(sessionId);
    const memStatus = this.getStatus(sessionId);

    if (inMemory && memStatus !== 'failed') {
      if (!existingBeforeCreate) {
        const inst = this.sessions.get(sessionId);
        if (inst?.socket) {
          try {
            inst.socket.end(undefined);
          } catch {
            /* ignore */
          }
        }
        this.sessions.delete(sessionId);
      } else {
        if (options?.userId && !existingBeforeCreate.user_id) {
          await sessionRepository.setOwner(sessionId, options.userId);
        }
        if (options?.apiKeyId) {
          await sessionRepository.bindApiKey(sessionId, options.apiKeyId);
        }
        if (phoneNumber) {
          await sessionRepository.setPhoneNumber(sessionId, phoneNumber);
        }
        await this.restart(sessionId);
        return;
      }
    }

    if ((await sessionRepository.count()) >= config.whatsapp.maxSessions) {
      throw new AppError('Maximum sessions reached', ERR.SESSION_LIMIT, 403);
    }

    const existing = await sessionRepository.findBySessionId(sessionId);
    if (!existing) {
      await sessionRepository.create({
        session_id: sessionId,
        api_key_id: options?.apiKeyId ?? null,
        user_id: options?.userId ?? null,
        status: 'initializing',
        phone_number: phoneNumber ?? null,
      });
    } else {
      if (options?.userId && !existing.user_id) {
        await sessionRepository.setOwner(sessionId, options.userId);
      }
      if (options?.apiKeyId && existing.api_key_id !== options.apiKeyId) {
        await sessionRepository.bindApiKey(sessionId, options.apiKeyId);
      }
      if (phoneNumber) {
        await sessionRepository.setPhoneNumber(sessionId, phoneNumber);
      }
    }

    await this.connect(sessionId);
  }

  private getAuthPath(sessionId: string): string {
    const p = path.join(config.whatsapp.authPath, sessionId);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
  }

  private setStatus(
    sessionId: string,
    status: SessionStatus,
    extra?: { phone_number?: string; display_name?: string },
    eventMeta?: { status_code?: number | null; reason?: string | null },
  ): void {
    const inst = this.sessions.get(sessionId) ?? {
      socket: null,
      status: 'initializing' as SessionStatus,
      qrBase64: null,
      lastQrRaw: null,
      reconnectAttempts: 0,
      isConnecting: false,
    };
    inst.status = status;
    this.sessions.set(sessionId, inst);
    this.statusCache.set(sessionId, status);
    void sessionRepository.updateStatus(sessionId, status, extra);
    void sessionEventRepository.log({
      session_id: sessionId,
      event: status,
      status_code: eventMeta?.status_code ?? null,
      reason: eventMeta?.reason ?? null,
      metadata: extra ?? null,
    });
    waEventBus.emitStatus(sessionId, status);
    waEventBus.emitLog(sessionId, `Status: ${status}`);

    if (status === 'connected') {
      fonnteService.clearCooldown(sessionId);
    }
  }

  private alertReconnectFailure(
    sessionId: string,
    statusCode: number | undefined,
    reason: string,
  ): void {
    void sessionRepository.findBySessionId(sessionId).then((row) => {
      if (!row?.phone_number) return;
      void fonnteService.notifyReconnectFailed({
        sessionId,
        phone: row.phone_number,
        reason,
        statusCode: statusCode ?? null,
      });
    });
  }

  async connect(sessionId: string): Promise<void> {
    let inst = this.sessions.get(sessionId);
    if (inst?.isConnecting) return;

    if (!inst) {
      inst = {
        socket: null,
        status: 'initializing',
        qrBase64: null,
        lastQrRaw: null,
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

    const inQrWait = inst.status === 'qr_ready' && !!inst.qrBase64;
    inst.isConnecting = true;

    if (!inQrWait) {
      inst.qrBase64 = null;
      inst.lastQrRaw = null;
      this.setStatus(sessionId, 'initializing');
    }

    try {
      const { version } = await fetchLatestBaileysVersion();
      const { state, saveCreds } = await useMultiFileAuthState(
        this.getAuthPath(sessionId),
      );

      const socket = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, waLogger),
        },
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        getMessage: async (key) => waMessageStore.get(key),
      });

      inst.socket = socket;

      socket.ev.on('creds.update', saveCreds);

      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          if (qr === inst!.lastQrRaw) return;

          inst!.reconnectAttempts = 0;
          inst!.lastQrRaw = qr;
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
          const rawJid = user?.id;
          const isLid = !!rawJid?.includes('@lid');
          const phone = rawJid && !isLid ? phoneFromWaJid(rawJid) : undefined;

          const row = await sessionRepository.findBySessionId(sessionId);
          if (row?.phone_number && phone) {
            if (!phonesMatch(row.phone_number, phone)) {
              waLogger.warn(
                { sessionId, registered: row.phone_number, scanned: phone, rawJid },
                'Nomor yang discan tidak cocok dengan nomor terdaftar',
              );
              this.setStatus(sessionId, 'failed', undefined, {
                reason: 'Nomor WhatsApp tidak cocok dengan akun terdaftar',
              });
              try {
                await socket.logout();
              } catch {
                /* ignore */
              }
              this.removeAuthFiles(sessionId);
              return;
            }
          }

          const connectedPhone =
            phone ??
            (row?.phone_number ? normalizePhoneDigits(row.phone_number) : undefined);

          this.setStatus(sessionId, 'connected', {
            phone_number: connectedPhone,
            display_name: user?.name ?? undefined,
          });
          void webhookService.dispatch('session.connected', sessionId, {
            phone_number: connectedPhone,
          });
          waLogger.info({ sessionId, phone: connectedPhone, rawJid }, 'Session connected');
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
          void sessionEventRepository.log({
            session_id: sessionId,
            event: 'connection_close',
            status_code: statusCode ?? null,
            reason: statusCode != null ? String(statusCode) : null,
            metadata: { phase: inst!.status },
          });

          if (statusCode === DisconnectReason.loggedOut) {
            this.setStatus(sessionId, 'disconnected');
            waLogger.warn({ sessionId, statusCode }, 'Session logged out dari HP — hapus creds');
            this.removeAuthFiles(sessionId);
            return;
          }

          const restartRequired = statusCode === DisconnectReason.restartRequired;
          const inQrPhase =
            inst!.status === 'initializing' ||
            inst!.status === 'qr_ready' ||
            inst!.status === 'reconnecting';

          if (inQrPhase && !restartRequired) {
            inst!.isConnecting = false;
            if (inst!.qrBase64) {
              this.setStatus(sessionId, 'qr_ready');
            }
            waLogger.info(
              { sessionId, statusCode },
              'QR phase disconnect — tunggu scan, tidak reconnect agresif',
            );
            return;
          }

          if (restartRequired || (inQrPhase && inst!.reconnectAttempts < 3)) {
            if (!restartRequired) inst!.reconnectAttempts++;
            this.setStatus(sessionId, inQrPhase ? 'qr_ready' : 'reconnecting');
            waLogger.warn(
              { sessionId, statusCode, attempt: inst!.reconnectAttempts, restartRequired },
              'Reconnecting session',
            );
            const delay = restartRequired
              ? 2000
              : Math.max(config.whatsapp.reconnectIntervalMs, 15000);
            setTimeout(() => {
              void this.connect(sessionId);
            }, delay);
            return;
          }

          if (inst!.reconnectAttempts < config.whatsapp.maxReconnectAttempts) {
            inst!.reconnectAttempts++;
            this.setStatus(sessionId, 'reconnecting');
            const backoff = Math.min(
              config.whatsapp.reconnectIntervalMs * inst!.reconnectAttempts,
              60000,
            );
            waLogger.warn(
              { sessionId, statusCode, attempt: inst!.reconnectAttempts, backoffMs: backoff },
              'Reconnecting session',
            );
            setTimeout(() => {
              void this.connect(sessionId);
            }, backoff);
            return;
          }

          waLogger.error({ sessionId, statusCode }, 'Session connection failed');
          this.alertReconnectFailure(
            sessionId,
            statusCode,
            `Reconnect gagal setelah ${config.whatsapp.maxReconnectAttempts} percobaan`,
          );
          this.setStatus(sessionId, 'failed', undefined, {
            status_code: statusCode ?? null,
            reason: 'Reconnect gagal — notifikasi Fonnte dikirim',
          });
        }
      });

      socket.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
        for (const msg of msgs) {
          if (msg.key && msg.message) {
            waMessageStore.save(msg.key, msg.message);
            waMessageStore.learnJidMapping(msg.key);
          }
          if (type === 'notify') {
            await this.handleIncomingMessage(sessionId, msg);
          }
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

    const dbId = await messageRepository.create({
      session_id: sessionId,
      message_id: msg.key.id ?? null,
      direction: 'inbound',
      type: 'text',
      to_number: formatDisplayPhone(from),
      from_number: formatDisplayPhone(from),
      content,
      status: 'received',
    });

    await messageRepository.log(dbId, sessionId, 'received', { content });

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
      this.statusCache.get(sessionId) ??
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

  private resolveMedia(payload: MessagePayload) {
    if (payload.mediaBuffer) return payload.mediaBuffer;
    if (payload.mediaUrl) return { url: payload.mediaUrl };
    throw new AppError(
      'Media wajib: kirim `url` (publik) atau upload field `file`',
      ERR.VALIDATION,
      422,
    );
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

    const jid = await resolveRecipientJid(socket, to);
    const media = this.resolveMedia.bind(this);
    let result: WAMessage | undefined;

    switch (payload.type) {
      case 'text':
        result = await socket.sendMessage(jid, {
          text: payload.message ?? '',
        });
        break;
      case 'image':
        result = await socket.sendMessage(jid, {
          image: media(payload),
          caption: payload.caption ?? payload.message,
        });
        break;
      case 'document':
        result = await socket.sendMessage(jid, {
          document: media(payload),
          mimetype: payload.mimetype ?? 'application/octet-stream',
          fileName: payload.fileName ?? 'document',
          caption: payload.caption ?? payload.message,
        });
        break;
      case 'audio':
        result = await socket.sendMessage(jid, {
          audio: media(payload),
          mimetype: payload.mimetype ?? 'audio/mpeg',
        });
        break;
      case 'video':
        result = await socket.sendMessage(jid, {
          video: media(payload),
          caption: payload.caption ?? payload.message,
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

    if (result.key && result.message) {
      waMessageStore.save(result.key, result.message);
    }

    const messageId = result.key.id ?? `local-${Date.now()}`;
    const dbId = await messageRepository.create({
      session_id: sessionId,
      message_id: messageId,
      direction: 'outbound',
      type: payload.type,
      to_number: to,
      content: payload.message ?? payload.caption ?? null,
      media_url: payload.mediaUrl ?? null,
      status: 'sent',
    });

    await messageRepository.log(dbId, sessionId, 'sent');
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

  private removeAuthFiles(sessionId: string): void {
    const authPath = this.getAuthPath(sessionId);
    if (!fs.existsSync(authPath)) return;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.rmSync(authPath, { recursive: true, force: true });
        return;
      } catch (err) {
        waLogger.warn({ sessionId, attempt, err }, 'Retry hapus folder auth');
      }
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const inst = this.sessions.get(sessionId);
    if (inst?.socket) {
      try {
        inst.socket.end(undefined);
      } catch {
        /* ignore */
      }
      inst.socket = null;
    }

    this.sessions.delete(sessionId);
    this.statusCache.delete(sessionId);
    await sessionRepository.delete(sessionId);
    this.removeAuthFiles(sessionId);

    waLogger.info({ sessionId }, 'Session dihapus (DB + folder auth)');
  }

  listSessions(): Record<string, SessionStatus> {
    const result: Record<string, SessionStatus> = {};
    for (const [id, inst] of this.sessions) {
      result[id] = inst.status;
    }
    for (const [id, status] of this.statusCache) {
      if (!result[id]) {
        result[id] = status;
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
