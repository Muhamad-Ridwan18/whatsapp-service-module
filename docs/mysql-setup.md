# MySQL Setup (Laragon / phpMyAdmin)

WSM mendukung **SQLite** (default) dan **MySQL**. Gunakan MySQL jika ingin melihat log, pesan, dan event disconnect lewat phpMyAdmin.

## 1. Buat database di Laragon

1. Buka **phpMyAdmin** atau HeidiSQL
2. Buat database baru, contoh: `whatsapp_service`
3. Charset: `utf8mb4`

## 2. Konfigurasi `.env`

```env
DB_DRIVER=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=whatsapp_service
```

## 3. Jalankan migrasi

Saat pertama kali start, tabel dibuat otomatis. Atau manual:

```bash
npm run migrate
```

## 4. Start service

```bash
npm run build
npm start
# production: pm2 restart whatsapp-service
```

## Tabel penting untuk monitoring

| Tabel | Isi |
|-------|-----|
| `session_events` | Connect, disconnect, QR, reconnect, failed + `status_code` Baileys |
| `messages` | Semua pesan masuk/keluar |
| `message_logs` | Event per pesan (sent, received, dll) |
| `audit_logs` | Request API, webhook gagal |
| `sessions` | Status session saat ini |

### Contoh query disconnect

```sql
SELECT * FROM session_events
WHERE event IN ('connection_close', 'disconnected', 'failed', 'reconnecting')
ORDER BY created_at DESC
LIMIT 100;
```

```sql
SELECT s.session_id, s.phone_number, s.status, e.event, e.status_code, e.reason, e.created_at
FROM session_events e
JOIN sessions s ON s.session_id = e.session_id
ORDER BY e.created_at DESC
LIMIT 50;
```

## Kembali ke SQLite

```env
DB_DRIVER=sqlite
DATABASE_PATH=storage/database.sqlite
```

Data SQLite dan MySQL **tidak otomatis disinkronkan**. Pilih satu driver per environment.
