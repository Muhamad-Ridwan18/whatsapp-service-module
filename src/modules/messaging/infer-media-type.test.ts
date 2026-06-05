import { describe, it, expect } from 'vitest';
import { inferMediaType } from './infer-media-type.js';

describe('inferMediaType', () => {
  it('detects image from url extension', () => {
    expect(inferMediaType({
      url: 'https://cdn.example.com/photo.jpg',
    })).toBe('image');
  });

  it('detects document for pdf', () => {
    expect(inferMediaType({
      url: 'https://cdn.example.com/invoice.pdf',
      filename: 'invoice.pdf',
    })).toBe('document');
  });

  it('defaults to text without media', () => {
    expect(inferMediaType({})).toBe('text');
  });
});
