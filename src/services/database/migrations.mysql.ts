export const mysqlMigrations: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role ENUM('super_admin', 'admin', 'client') NOT NULL DEFAULT 'client',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS api_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        key_hash VARCHAR(255) NOT NULL UNIQUE,
        key_prefix VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL,
        permissions TEXT NOT NULL,
        webhook_url VARCHAR(2048) NULL,
        webhook_events TEXT NULL,
        ip_whitelist TEXT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_used_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(128) NOT NULL UNIQUE,
        user_id INT NULL,
        api_key_id INT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'initializing',
        phone_number VARCHAR(32) NULL,
        display_name VARCHAR(255) NULL,
        metadata TEXT NULL,
        last_connected_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,
        INDEX idx_sessions_status (status),
        INDEX idx_sessions_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(128) NOT NULL,
        message_id VARCHAR(128) NULL,
        direction ENUM('inbound', 'outbound') NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'text',
        to_number VARCHAR(32) NOT NULL,
        from_number VARCHAR(32) NULL,
        content TEXT NULL,
        media_url TEXT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        api_key_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,
        INDEX idx_messages_session (session_id),
        INDEX idx_messages_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS message_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NULL,
        session_id VARCHAR(128) NOT NULL,
        event VARCHAR(64) NOT NULL,
        payload TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        INDEX idx_message_logs_session (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS webhooks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        api_key_id INT NOT NULL,
        url VARCHAR(2048) NOT NULL,
        events TEXT NOT NULL,
        secret VARCHAR(255) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        api_key_id INT NULL,
        action VARCHAR(128) NOT NULL,
        resource VARCHAR(255) NULL,
        ip_address VARCHAR(64) NULL,
        user_agent TEXT NULL,
        metadata TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,
        INDEX idx_audit_logs_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
  },
  {
    version: 2,
    sql: `
      CREATE UNIQUE INDEX idx_sessions_api_key_unique ON sessions (api_key_id);

      UPDATE sessions s
      INNER JOIN (
        SELECT s1.id AS session_pk,
          (
            SELECT ak.id
            FROM api_keys ak
            WHERE ak.user_id = s1.user_id AND ak.is_active = 1
            ORDER BY ak.id ASC
            LIMIT 1
          ) AS bound_key
        FROM sessions s1
        WHERE s1.api_key_id IS NULL
          AND s1.user_id IS NOT NULL
          AND (
            SELECT COUNT(*) FROM sessions s2 WHERE s2.user_id = s1.user_id
          ) = 1
      ) src ON src.session_pk = s.id
      SET s.api_key_id = src.bound_key
      WHERE src.bound_key IS NOT NULL;
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS session_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(128) NOT NULL,
        event VARCHAR(64) NOT NULL,
        status_code INT NULL,
        reason VARCHAR(255) NULL,
        metadata TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session_events_session (session_id),
        INDEX idx_session_events_created (created_at),
        INDEX idx_session_events_event (event)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE users ADD COLUMN phone_number VARCHAR(32) NULL;

      UPDATE users u
      INNER JOIN sessions s ON s.user_id = u.id AND s.phone_number IS NOT NULL
      SET u.phone_number = s.phone_number
      WHERE u.phone_number IS NULL;

      CREATE UNIQUE INDEX idx_users_phone_unique ON users (phone_number);

      CREATE UNIQUE INDEX idx_sessions_user_unique ON sessions (user_id);

      CREATE UNIQUE INDEX idx_sessions_phone_unique ON sessions (phone_number);
    `,
  },
  {
    version: 5,
    sql: `
      ALTER TABLE api_keys ADD COLUMN key_encrypted TEXT NULL;
    `,
  },
];
