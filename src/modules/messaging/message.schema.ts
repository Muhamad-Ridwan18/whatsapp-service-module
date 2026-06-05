import { z } from 'zod';

const messageTypeEnum = z.enum([
  'text',
  'image',
  'document',
  'audio',
  'video',
  'location',
  'contact',
]);

export const sendMessageSchema = z.object({
  sessionId: z.string().min(2).max(50),
  to: z.string().min(8).max(20),
  message: z.string().optional(),
  type: messageTypeEnum.default('text'),
  mediaUrl: z.string().url().optional(),
  caption: z.string().optional(),
  fileName: z.string().optional(),
  mimetype: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  contactName: z.string().optional(),
  contactNumber: z.string().optional(),
});

export const bulkMessageSchema = z.object({
  messages: z.array(sendMessageSchema.extend({
    priority: z.number().int().min(0).max(10).optional(),
  })).min(1).max(100),
});
