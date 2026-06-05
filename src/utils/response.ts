import type { FastifyReply } from 'fastify';
import type { ApiResponse } from '../types/index.js';

export function sendSuccess<T>(
  reply: FastifyReply,
  data?: T,
  statusCode = 200,
): FastifyReply {
  const body: ApiResponse<T> = { success: true };
  if (data !== undefined) {
    body.data = data;
  }
  return reply.status(statusCode).send(body);
}

export function sendError(
  reply: FastifyReply,
  message: string,
  code: string,
  statusCode = 400,
): FastifyReply {
  const body: ApiResponse = { success: false, message, code };
  return reply.status(statusCode).send(body);
}
