export type UserRole = 'super_admin' | 'admin' | 'client';

export type SessionStatus =
  | 'initializing'
  | 'qr_ready'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'failed';

export type MessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'video'
  | 'location'
  | 'contact';

export type WebhookEvent =
  | 'message.received'
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'session.connected'
  | 'session.disconnected'
  | 'qr.updated';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  code?: string;
  data?: T;
}

export interface JwtPayload {
  sub: number;
  email: string;
  role: UserRole;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: number;
  user_id: number;
  key_hash: string;
  key_prefix: string;
  name: string;
  permissions: string;
  webhook_url: string | null;
  webhook_events: string | null;
  ip_whitelist: string | null;
  is_active: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: number;
  session_id: string;
  user_id: number | null;
  api_key_id: number | null;
  status: SessionStatus;
  phone_number: string | null;
  display_name: string | null;
  metadata: string | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionEventRow {
  id: number;
  session_id: string;
  event: string;
  status_code: number | null;
  reason: string | null;
  metadata: string | null;
  created_at: string;
}

export interface MessageRow {
  id: number;
  session_id: string;
  message_id: string | null;
  direction: 'inbound' | 'outbound';
  type: MessageType;
  to_number: string;
  from_number: string | null;
  content: string | null;
  media_url: string | null;
  status: string;
  api_key_id: number | null;
  created_at: string;
}

export interface WebhookRow {
  id: number;
  api_key_id: number;
  url: string;
  events: string;
  secret: string | null;
  is_active: number;
  created_at: string;
}

export interface QueueJob {
  id: string;
  sessionId: string;
  to: string;
  payload: MessagePayload;
  priority: number;
  retries: number;
  maxRetries: number;
  apiKeyId?: number;
  createdAt: number;
}

export interface MessagePayload {
  type: MessageType;
  message?: string;
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  caption?: string;
  fileName?: string;
  mimetype?: string;
  latitude?: number;
  longitude?: number;
  contactName?: string;
  contactNumber?: string;
}

export interface SendMessageBody {
  sessionId: string;
  to: string;
  message?: string;
  type?: MessageType;
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  caption?: string;
  fileName?: string;
  mimetype?: string;
  latitude?: number;
  longitude?: number;
  contactName?: string;
  contactNumber?: string;
}

export interface BulkMessageItem extends SendMessageBody {
  priority?: number;
}
