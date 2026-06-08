import { z } from 'zod';

export const loginSchema = z.object({
  phone: z.string().min(10, 'Nomor WhatsApp tidak valid'),
  password: z.string().min(6),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).optional(),
  webhook_url: z.string().url().optional().nullable(),
  webhook_events: z.array(z.string()).optional(),
  ip_whitelist: z.string().optional().nullable(),
});
