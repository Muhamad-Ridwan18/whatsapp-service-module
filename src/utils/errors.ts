export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ERR = {
  UNAUTHORIZED: 'ERR_UNAUTHORIZED',
  FORBIDDEN: 'ERR_FORBIDDEN',
  NOT_FOUND: 'ERR_NOT_FOUND',
  VALIDATION: 'ERR_VALIDATION',
  SESSION_EXISTS: 'ERR_SESSION_EXISTS',
  SESSION_NOT_FOUND: 'ERR_SESSION_NOT_FOUND',
  SESSION_LIMIT: 'ERR_SESSION_LIMIT',
  SESSION_NOT_CONNECTED: 'ERR_SESSION_NOT_CONNECTED',
  MESSAGE_FAILED: 'ERR_MESSAGE_FAILED',
  RATE_LIMIT: 'ERR_RATE_LIMIT',
  IP_BLOCKED: 'ERR_IP_BLOCKED',
  INTERNAL: 'ERR_INTERNAL',
  KEY_LIMIT: 'ERR_KEY_LIMIT',
} as const;
