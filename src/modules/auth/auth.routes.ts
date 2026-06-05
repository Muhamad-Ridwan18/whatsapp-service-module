import type { FastifyInstance } from 'fastify';
import { apiKeyRepository } from '../../services/database/repositories/api-key.repository.js';
import { userRepository } from '../../services/database/repositories/user.repository.js';
import { verifyPassword, generateApiKey } from '../../utils/crypto.js';
import { AppError, ERR } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';
import { jwtAuth, requireRole } from '../../middleware/auth.js';
import { loginSchema, createApiKeySchema } from './auth.schema.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', {
    schema: {
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = userRepository.findByEmail(body.email);

    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      throw new AppError('Invalid credentials', ERR.UNAUTHORIZED, 401);
    }

    const token = app.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return sendSuccess(reply, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  });

  app.post('/api/auth/api-keys', {
    preHandler: [jwtAuth, requireRole('super_admin', 'admin')],
    schema: { tags: ['Auth'] },
  }, async (request, reply) => {
    const body = createApiKeySchema.parse(request.body);
    const { key, hash, prefix } = generateApiKey();

    const id = apiKeyRepository.create({
      user_id: request.authUser!.sub,
      key_hash: hash,
      key_prefix: prefix,
      name: body.name,
      permissions: body.permissions
        ? JSON.stringify(body.permissions)
        : undefined,
      webhook_url: body.webhook_url,
      webhook_events: body.webhook_events
        ? JSON.stringify(body.webhook_events)
        : undefined,
      ip_whitelist: body.ip_whitelist,
    });

    return sendSuccess(reply, {
      id,
      apiKey: key,
      prefix,
      warning: 'Store this key securely. It will not be shown again.',
    }, 201);
  });

  app.get('/api/auth/api-keys', {
    preHandler: [jwtAuth],
  }, async (request, reply) => {
    const keys = apiKeyRepository.findByUserId(request.authUser!.sub);
    return sendSuccess(reply, keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.key_prefix,
      permissions: JSON.parse(k.permissions),
      webhook_url: k.webhook_url,
      is_active: k.is_active,
      last_used_at: k.last_used_at,
      created_at: k.created_at,
    })));
  });
}
