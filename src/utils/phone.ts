export function normalizePhone(number: string): string {
  let cleaned = number.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
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
