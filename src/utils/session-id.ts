import { normalizePhoneDigits } from './phone.js';

export { normalizePhoneDigits } from './phone.js';

export function sessionIdFromPhone(phone: string): string {
  const normalized = normalizePhoneDigits(phone);
  return `wa-${normalized}`;
}
