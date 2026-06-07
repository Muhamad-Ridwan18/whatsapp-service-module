# Production Deployment Guide

## Requirements

- Ubuntu 22.04+ VPS (1GB RAM minimum, 2GB recommended)
- Node.js 20 LTS
- Nginx
- PM2
- Domain with DNS pointed to VPS

## 1. Server Setup (Ubuntu)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Create app user
sudo useradd -m -s /bin/bash wsm
sudo mkdir -p /var/www/whatsapp-service
sudo chown wsm:wsm /var/www/whatsapp-service
```

## 2. Deploy Application

```bash
sudo su - wsm
cd /var/www/whatsapp-service

# Clone or upload project
git clone <your-repo> .

# Install dependencies
npm ci --omit=dev
npm run build

# Configure environment
cp .env.example .env
nano .env
```

### Required `.env` changes for production:

```env
NODE_ENV=production
BASE_URL=https://wa.yourdomain.com
JWT_SECRET=<generate-64-char-random-string>
ADMIN_PASSWORD=<strong-password>
CORS_ORIGIN=https://your-laravel-app.com
```

## 3. Create API Key

```bash
# Start temporarily
npm run pm2:start

# Login and create API key
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost","password":"YOUR_PASSWORD"}'

# Use returned JWT to create API key
curl -X POST http://localhost:3000/api/auth/api-keys \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Laravel Production","permissions":["message:send","session:create","session:read","session:manage"]}'
```

## 4. PM2

```bash
mkdir -p logs storage/auth
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# Run the command PM2 outputs
```

## 5. Nginx

Copy `docs/nginx.conf.example` to `/etc/nginx/sites-available/whatsapp-service` and enable:

```bash
sudo ln -s /etc/nginx/sites-available/whatsapp-service /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 6. SSL (Let's Encrypt)

See `docs/ssl-setup.md`

## 7. Laravel Integration

```php
// config/services.php
'whatsapp' => [
    'url' => env('WHATSAPP_SERVICE_URL'),
    'api_key' => env('WHATSAPP_API_KEY'),
],

// Example HTTP call
Http::withToken(config('services.whatsapp.api_key'))
    ->post(config('services.whatsapp.url') . '/api/message/send', [
        'sessionId' => 'baytgo',
        'to' => '628123456789',
        'message' => 'Hello from Laravel',
    ]);
```

## 8. Monitoring

```bash
pm2 monit
pm2 logs whatsapp-service
curl https://wa.yourdomain.com/health
```

## PM2 — hindari restart otomatis

`ecosystem.config.js` **tidak** memakai `max_memory_restart` (limit 450M dulu sering restart & putuskan session WhatsApp).

- PM2 restart hanya jika proses **crash**
- `max_restarts: 3` — batasi restart beruntun cepat
- `restart_delay: 15s` + exponential backoff
- Node heap: `NODE_OPTIONS=--max-old-space-size=1024`

Setelah ubah config:

```bash
pm2 delete whatsapp-service
pm2 start ecosystem.config.js
pm2 save
```

## Memory Optimization Tips

- Keep `MAX_SESSIONS` low on 1GB VPS (3-5 sessions)
- Set `QUEUE_CONCURRENCY=1` on small VPS
- Enable swap: `sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
