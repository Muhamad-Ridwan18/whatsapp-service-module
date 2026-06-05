export function normalizePhoneDigits(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned;
}

export function sessionIdFromPhone(phone: string): string {
  const normalized = normalizePhoneDigits(phone);
  return `wa-${normalized}`;
}
