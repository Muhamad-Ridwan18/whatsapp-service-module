import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import view from '@fastify/view';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import ejs from 'ejs';
import { config } from './config/index.js';
import { swaggerConfig } from './config/swagger.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { globalIpWhitelist } from './middleware/ip-whitelist.js';
import { requestLogger } from './services/logger/index.js';

export async function buildApp() {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  });

  await app.register(cors, {
    origin: config.cors.origin === '*' ? true : config.cors.origin.split(','),
    credentials: true,
  });

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
  });

  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn },
  });

  await app.register(cookie);
  await app.register(formbody);
  await app.register(multipart, {
    limits: { fileSize: 16 * 1024 * 1024 },
  });
  await app.register(websocket);

  const publicDir = path.join(process.cwd(), 'public');
  const cssFile = path.join(publicDir, 'css', 'app.css');
  const assetVersion = fs.existsSync(cssFile)
    ? String(Math.floor(fs.statSync(cssFile).mtimeMs))
    : '0';

  await app.register(staticPlugin, {
    root: publicDir,
    prefix: '/public/',
  });

  // Alias /css/app.css → same file (backward compat for cached HTML)
  app.get('/css/app.css', async (_request, reply) => {
    if (!fs.existsSync(cssFile)) {
      return reply.code(404).send({ message: 'CSS not found. Run: npm run build:css' });
    }
    return reply
      .header('Cache-Control', 'public, max-age=3600')
      .type('text/css; charset=utf-8')
      .send(fs.createReadStream(cssFile));
  });

  await app.register(view, {
    engine: { ejs },
    root: path.join(process.cwd(), 'src', 'views'),
    defaultContext: { baseUrl: config.baseUrl, assetVersion },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(swagger, swaggerConfig as any);
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  app.addHook('onRequest', globalIpWhitelist);

  app.addHook('onResponse', (request, reply, done) => {
    requestLogger.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    });
    done();
  });

  app.setErrorHandler(errorHandler);

  await registerRoutes(app);

  return app;
}
