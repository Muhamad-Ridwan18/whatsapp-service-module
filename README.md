# WhatsApp Service Module

Lightweight WhatsApp engine microservice built with **Node.js + TypeScript + Baileys**. Designed for small VPS deployment, Laravel integration, and multi-session support.

## Features

- Multi-session WhatsApp (Baileys multi-device)
- Session persistence (no re-login after restart)
- API Key + JWT authentication
- Lightweight in-memory message queue (anti-spam delay 3–8s)
- Webhook events with 3x retry
- Swagger API docs at `/docs`
- Admin dashboard with QR scanner & realtime logs
- SQLite database (zero external DB dependency)
- PM2 production ready

## Quick Start

```bash
cp .env.example .env
npm install
npm run build
npm run dev
```

- Dashboard: http://localhost:3000/login
- API Docs: http://localhost:3000/docs
- Health: http://localhost:3000/health

Default admin (first boot): `admin@localhost` / `changeme123`

## API Examples

### Create Session

```bash
curl -X POST http://localhost:3000/api/session/create \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "baytgo"}'
```

### Get QR

```bash
curl http://localhost:3000/api/session/baytgo/qr \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Send Message

```bash
curl -X POST http://localhost:3000/api/message/send \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "baytgo",
    "to": "628123456789",
    "message": "Hello from API"
  }'
```

### Bulk Messages

```bash
curl -X POST http://localhost:3000/api/message/bulk \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"sessionId": "baytgo", "to": "628111", "message": "Hi 1", "priority": 1},
      {"sessionId": "baytgo", "to": "628222", "message": "Hi 2"}
    ]
  }'
```

## WebSocket QR (Realtime)

```
ws://localhost:3000/ws/session/baytgo/qr
```

## Architecture

```
src/
├── app.ts              # Fastify app builder
├── server.ts           # Entry point
├── config/             # Environment config
├── routes/             # Route aggregator
├── middleware/         # Auth, rate limit, audit
├── modules/            # Feature modules (auth, sessions, messaging)
├── services/
│   ├── whatsapp/       # Baileys session manager
│   ├── queue/          # In-memory message queue
│   ├── database/       # SQLite + repositories
│   └── webhook/        # Webhook dispatcher
└── views/              # EJS dashboard
```

## Production

See [docs/deployment.md](docs/deployment.md)

```bash
npm run build
pm2 start ecosystem.config.js
```

## License

MIT
