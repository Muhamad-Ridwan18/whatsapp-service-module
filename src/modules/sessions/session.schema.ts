import { z } from 'zod';
import { resolvePhoneNumber } from '../../utils/phone.js';
import { sessionIdFromPhone } from '../../utils/session-id.js';

export const createSessionSchema = z
  .object({
    phoneNumber: z
      .string()
      .min(10, 'Nomor HP minimal 10 digit')
      .max(16)
      .regex(/^[0-9+\s-]+$/, 'Format nomor tidak valid')
      .optional(),
    target: z
      .string()
      .min(7, 'Nomor domestik minimal 7 digit')
      .max(15)
      .regex(/^[0-9+\s-]+$/, 'Format target tidak valid')
      .optional(),
    countryCode: z
      .string()
      .min(1)
      .max(5)
      .regex(/^[+0-9]+$/, 'Format countryCode tidak valid')
      .optional(),
  })
  .refine(
    (data) => !!data.phoneNumber?.trim() || !!data.target?.trim(),
    { message: 'Isi `phoneNumber` (E.164) atau `target` (+ `countryCode`, default 62)' },
  )
  .transform((data) => {
    const phoneNumber = resolvePhoneNumber({
      to: data.phoneNumber,
      target: data.target,
      countryCode: data.countryCode,
    });

    return {
      phoneNumber,
      sessionId: sessionIdFromPhone(phoneNumber),
    };
  });

export const sessionIdParamSchema = z.object({
  sessionId: z.string().min(2).max(50),
});
