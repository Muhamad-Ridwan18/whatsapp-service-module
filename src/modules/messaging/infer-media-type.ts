import type { MessageType } from '../../types/index.js';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp)$/i;
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm)$/i;
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|aac|opus)$/i;

function extFrom(path?: string): string {
  if (!path) return '';
  const clean = path.split('?')[0] ?? path;
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot) : '';
}

export function inferMediaType(input: {
  type?: MessageType;
  mediaUrl?: string;
  url?: string;
  fileName?: string;
  filename?: string;
  mimetype?: string;
}): MessageType {
  if (input.type) return input.type;

  const mime = input.mimetype?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  const ext = extFrom(
    input.fileName ?? input.filename ?? input.mediaUrl ?? input.url,
  );
  if (IMAGE_EXT.test(ext)) return 'image';
  if (VIDEO_EXT.test(ext)) return 'video';
  if (AUDIO_EXT.test(ext)) return 'audio';

  if (input.mediaUrl || input.url) return 'document';
  return 'text';
}
