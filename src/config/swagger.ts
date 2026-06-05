export const swaggerConfig = {
  mode: 'dynamic' as const,
  openapi: {
    openapi: '3.0.3' as const,
    info: {
      title: 'WhatsApp Service Module API',
      description:
        'Lightweight WhatsApp engine microservice for Laravel and other backends. Authenticate with API Key via `Authorization: Bearer <API_KEY>`.',
      version: '1.0.0',
    },
    servers: [
      { url: '/', description: 'Current server' },
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'http' as const,
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'Use your API key as Bearer token',
        },
        jwt: {
          type: 'http' as const,
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication & API keys' },
      { name: 'Sessions', description: 'WhatsApp session management' },
      { name: 'Messaging', description: 'Send messages' },
      { name: 'Health', description: 'Health check' },
    ],
  },
};
