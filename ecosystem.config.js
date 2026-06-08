const path = require('path');

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
      // Tanpa max_memory_restart — limit 450M sering memutus session WhatsApp.
      // Node mengatur heap sendiri; PM2 hanya restart jika proses benar-benar crash.
      min_uptime: '60s',
      max_restarts: 3,
      restart_delay: 15000,
      exp_backoff_restart_delay: 200,
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=1024',
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
