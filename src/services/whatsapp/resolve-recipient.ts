import type { WASocket } from '@whiskeysockets/baileys';
import { AppError, ERR } from '../../utils/errors.js';
import { toJid } from '../../utils/phone.js';
import { waMessageStore } from './message-store.js';

export async function resolveRecipientJid(
  socket: WASocket,
  to: string,
): Promise<string> {
  const pnJid = toJid(to);
  const mappedLid = waMessageStore.resolveLid(pnJid);
  const lookupJid = mappedLid ?? pnJid;

  const results = await socket.onWhatsApp(lookupJid);
  const match = results?.[0];

  if (!match?.exists) {
    throw new AppError(
      `Nomor ${to} tidak terdaftar di WhatsApp`,
      ERR.NOT_FOUND,
      404,
    );
  }

  const targetJid = String(match.jid);
  await socket.assertSessions([targetJid], true);
  await socket.presenceSubscribe(targetJid).catch(() => undefined);

  return targetJid;
}
