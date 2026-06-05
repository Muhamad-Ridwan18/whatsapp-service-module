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

export function formatDisplayPhone(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}
