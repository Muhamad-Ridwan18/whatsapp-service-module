import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { sendError } from '../utils/response.js';
import { logger } from '../services/logger/index.js';

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    void sendError(reply, error.message, error.code, error.statusCode);
    return;
  }

  if (error instanceof ZodError) {
    const message = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    void sendError(reply, message, 'ERR_VALIDATION', 422);
    return;
  }

  if (error.validation) {
    void sendError(reply, error.message, 'ERR_VALIDATION', 400);
    return;
  }

  if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
    void sendError(reply, 'File terlalu besar (maks 16MB)', 'ERR_VALIDATION', 413);
    return;
  }

  if (error.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
    void sendError(reply, 'Content-Type multipart tidak valid', 'ERR_VALIDATION', 400);
    return;
  }

  logger.error({ err: error }, 'Unhandled error');
  void sendError(reply, 'Internal server error', 'ERR_INTERNAL', 500);
}
