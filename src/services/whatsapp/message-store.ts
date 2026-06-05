import type { proto, WAMessageKey } from '@whiskeysockets/baileys';

const MAX_MESSAGES = 5000;

function keyId(key: proto.IMessageKey): string | null {
  if (!key.remoteJid || !key.id) return null;
  return `${key.remoteJid}:${key.id}`;
}

/** Cache pesan untuk getMessage — mencegah "Menunggu pesan ini" saat retry. */
class WaMessageStore {
  private messages = new Map<string, proto.IMessage>();
  /** PN (@s.whatsapp.net) → LID (@lid) dari pesan masuk. */
  private pnToLid = new Map<string, string>();

  save(key: WAMessageKey, message: proto.IMessage): void {
    const id = keyId(key);
    if (!id) return;

    if (this.messages.size >= MAX_MESSAGES) {
      const first = this.messages.keys().next().value;
      if (first) this.messages.delete(first);
    }
    this.messages.set(id, message);
  }

  get(key: proto.IMessageKey): proto.IMessage | undefined {
    const id = keyId(key);
    if (!id) return undefined;
    return this.messages.get(id);
  }

  learnJidMapping(key: WAMessageKey): void {
    const remote = key.remoteJid;
    if (!remote?.includes('@lid')) return;

    const pn = key.senderPn ?? key.participantPn;
    if (!pn) return;

    const normalized = pn.includes('@') ? pn : `${pn.replace(/\D/g, '')}@s.whatsapp.net`;
    this.pnToLid.set(normalized, remote);
  }

  resolveLid(pnJid: string): string | undefined {
    return this.pnToLid.get(pnJid);
  }
}

export const waMessageStore = new WaMessageStore();
