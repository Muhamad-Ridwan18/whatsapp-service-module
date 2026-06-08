const path = require('path');

// Muat .env ke proses PM2 — child process pasti dapat DB_DRIVER=mysql dll.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const PASSTHROUGH_ENV = [
  'DB_DRIVER',
  'DATABASE_PATH',
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_DATABASE',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'HOST',
  'PORT',
  'BASE_URL',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'ADMIN_NAME',
  'API_KEY_PREFIX',
  'API_KEY_MAX_LENGTH',
  'AUTH_STORAGE_PATH',
  'DASHBOARD_ENABLED',
  'CORS_ORIGIN',
  'IP_WHITELIST',
];

const fromDotenv = {};
for (const key of PASSTHROUGH_ENV) {
  if (process.env[key] !== undefined) {
    fromDotenv[key] = process.env[key];
  }
}

module.exports = {
  apps: [
    {
      name: 'whatsapp-service',
      script: 'dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      min_uptime: '60s',
      max_restarts: 3,
      restart_delay: 15000,
      exp_backoff_restart_delay: 200,
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=1024',
        ...fromDotenv,
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 15000,
      listen_timeout: 10000,
      wait_ready: true,
    },
  ],
};
