export function normalizeCountryCode(code: string): string {
  let cc = code.replace(/\D/g, '');
  if (cc.startsWith('0')) {
    cc = cc.slice(1);
  }
  return cc;
}

export function normalizePhoneDigits(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned;
}

export function resolvePhoneNumber(input: {
  to?: string;
  target?: string;
  countryCode?: string;
}): string {
  if (input.to?.trim()) {
    return normalizePhoneDigits(input.to.trim());
  }

  if (input.target?.trim()) {
    const cc = normalizeCountryCode(input.countryCode?.trim() || '62');
    let target = input.target.replace(/\D/g, '');
    if (target.startsWith('0')) {
      target = target.slice(1);
    }
    if (!target) {
      throw new Error('Format `target` tidak valid');
    }
    return `${cc}${target}`;
  }

  throw new Error('Nomor tujuan wajib diisi: `to` atau `target` (+ `countryCode`)');
}

export function normalizePhone(number: string): string {
  const cleaned = normalizePhoneDigits(number);
  if (!cleaned.includes('@')) {
    return `${cleaned}@s.whatsapp.net`;
  }
  return cleaned;
}

export function toJid(number: string): string {
  if (number.includes('@')) return number;
  return normalizePhone(number);
}

/** Ambil digit nomor dari JID Baileys (buang @server dan suffix :device). */
export function phoneFromWaJid(jid: string): string {
  const userPart = (jid.split('@')[0] ?? jid).split(':')[0] ?? jid;
  return normalizePhoneDigits(userPart);
}

export function formatDisplayPhone(jid: string): string {
  if (jid.includes('@lid')) {
    return (jid.split('@')[0] ?? jid).split(':')[0] ?? jid;
  }
  return phoneFromWaJid(jid);
}

/** Cocokkan nomor terdaftar vs hasil scan (toleran format 62/0 dan suffix device). */
export function phonesMatch(registered: string, scanned: string): boolean {
  const a = normalizePhoneDigits(registered);
  const b = normalizePhoneDigits(scanned);
  if (!a || !b) return false;
  if (a === b) return true;

  const toLocal = (n: string) => {
    let x = n;
    if (x.startsWith('62')) x = x.slice(2);
    if (x.startsWith('0')) x = x.slice(1);
    return x;
  };

  const aLocal = toLocal(a);
  const bLocal = toLocal(b);
  return aLocal.length >= 9 && aLocal === bLocal;
}
