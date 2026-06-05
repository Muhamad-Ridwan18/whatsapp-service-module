import { z } from 'zod';
import { normalizePhoneDigits, sessionIdFromPhone } from '../../utils/session-id.js';

export const createSessionSchema = z
  .object({
    phoneNumber: z
      .string()
      .min(10, 'Nomor HP minimal 10 digit')
      .max(16)
      .regex(/^[0-9+\s-]+$/, 'Format nomor tidak valid'),
    sessionId: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Session ID: huruf, angka, dash, underscore')
      .optional(),
  })
  .transform((data) => ({
    phoneNumber: normalizePhoneDigits(data.phoneNumber),
    sessionId: data.sessionId ?? sessionIdFromPhone(data.phoneNumber),
  }));

export const sessionIdParamSchema = z.object({
  sessionId: z.string().min(2).max(50),
});
