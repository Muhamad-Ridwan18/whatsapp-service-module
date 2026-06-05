import { describe, it, expect } from 'vitest';
import { sendMessageSchema } from './message.schema.js';

describe('sendMessageSchema', () => {
  it('parses `to` format', () => {
    const result = sendMessageSchema.parse({
      sessionId: 'wa-628123456789',
      to: '628987654321',
      message: 'Halo',
    });
    expect(result.to).toBe('628987654321');
    expect(result.type).toBe('text');
  });

  it('parses Fonnte-style target + countryCode', () => {
    const result = sendMessageSchema.parse({
      sessionId: 'wa-628123456789',
      target: '08987654321',
      countryCode: '62',
      message: 'Halo',
    });
    expect(result.to).toBe('628987654321');
  });

  it('maps Fonnte url/filename aliases', () => {
    const result = sendMessageSchema.parse({
      sessionId: 'wa-628123456789',
      target: '8987654321',
      url: 'https://example.com/file.pdf',
      filename: 'invoice.pdf',
      caption: 'Invoice',
    });
    expect(result.to).toBe('628987654321');
    expect(result.mediaUrl).toBe('https://example.com/file.pdf');
    expect(result.fileName).toBe('invoice.pdf');
    expect(result.type).toBe('document');
  });

  it('detects image type from jpg url', () => {
    const result = sendMessageSchema.parse({
      sessionId: 'wa-628123456789',
      target: '8987654321',
      countryCode: '62',
      url: 'https://example.com/photo.png',
      message: 'Lihat foto',
    });
    expect(result.type).toBe('image');
  });
});
