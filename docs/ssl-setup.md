# SSL Setup with Let's Encrypt

## Prerequisites

- Domain DNS A record pointing to your VPS IP
- Nginx configured (HTTP server block on port 80)

## Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

## Obtain Certificate

```bash
sudo certbot --nginx -d wa.yourdomain.com
```

Follow the prompts. Certbot will automatically configure Nginx SSL.

## Auto-Renewal

Certbot installs a cron job automatically. Verify:

```bash
sudo certbot renew --dry-run
```

## Manual Renewal

```bash
sudo certbot renew
sudo systemctl reload nginx
```

## Troubleshooting

- **Port 80 blocked**: Ensure firewall allows HTTP/HTTPS
  ```bash
  sudo ufw allow 'Nginx Full'
  ```
- **DNS not propagated**: Wait up to 48 hours, verify with `dig wa.yourdomain.com`
