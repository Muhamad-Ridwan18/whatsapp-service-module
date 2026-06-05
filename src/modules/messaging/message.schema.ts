import { z } from 'zod';
import { resolvePhoneNumber } from '../../utils/phone.js';
import { inferMediaType } from './infer-media-type.js';

const messageTypeEnum = z.enum([
  'text',
  'image',
  'document',
  'audio',
  'video',
  'location',
  'contact',
]);

const recipientFields = {
  to: z.string().min(8).max(20).optional(),
  target: z.string().min(7).max(15).optional(),
  countryCode: z.string().min(1).max(5).optional(),
};

const optionalHttpUrl = z.preprocess(
  (val) => {
    if (typeof val !== 'string' || !val.trim()) return undefined;
    const trimmed = val.trim();
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  },
  z.string().url().optional(),
);

const mediaFields = {
  message: z.string().optional(),
  type: messageTypeEnum.optional(),
  mediaUrl: optionalHttpUrl,
  url: optionalHttpUrl,
  caption: z.string().optional(),
  fileName: z.string().optional(),
  filename: z.string().optional(),
  mimetype: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  contactName: z.string().optional(),
  contactNumber: z.string().optional(),
};

const recipientRefine = (data: { to?: string; target?: string }) =>
  !!data.to?.trim() || !!data.target?.trim();

function parseSendMessage(data: {
  sessionId: string;
  to?: string;
  target?: string;
  countryCode?: string;
  message?: string;
  type?: z.infer<typeof messageTypeEnum>;
  mediaUrl?: string;
  url?: string;
  caption?: string;
  fileName?: string;
  filename?: string;
  mimetype?: string;
  latitude?: number;
  longitude?: number;
  contactName?: string;
  contactNumber?: string;
}) {
  const to = resolvePhoneNumber({
    to: data.to,
    target: data.target,
    countryCode: data.countryCode,
  });

  const mediaUrl = data.mediaUrl ?? data.url;
  const fileName = data.fileName ?? data.filename;
  const type = inferMediaType({
    type: data.type,
    mediaUrl,
    url: data.url,
    fileName,
    mimetype: data.mimetype,
  });

  return {
    sessionId: data.sessionId,
    to,
    message: data.message,
    type,
    mediaUrl,
    caption: data.caption,
    fileName,
    mimetype: data.mimetype,
    latitude: data.latitude,
    longitude: data.longitude,
    contactName: data.contactName,
    contactNumber: data.contactNumber
      ? resolvePhoneNumber({ to: data.contactNumber })
      : undefined,
  };
}

const baseSendMessageSchema = z.object({
  sessionId: z.string().min(2).max(50),
  ...recipientFields,
  ...mediaFields,
});

export const sendMessageSchema = baseSendMessageSchema
  .refine(recipientRefine, {
    message: 'Isi `to` (E.164 tanpa +) atau `target` (+ `countryCode`, default 62)',
  })
  .transform(parseSendMessage);

export const bulkMessageSchema = z.object({
  messages: z.array(
    baseSendMessageSchema
      .extend({ priority: z.number().int().min(0).max(10).optional() })
      .refine(recipientRefine, {
        message: 'Isi `to` atau `target` (+ `countryCode`)',
      })
      .transform((msg) => ({
        ...parseSendMessage(msg),
        priority: msg.priority,
      })),
  ).min(1).max(100),
});
