import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';

interface TableRow extends RowDataPacket {
  TABLE_NAME: string;
}
import { config } from '../config/index.js';
import { ensureUserBundle } from '../services/account/account.service.js';
import { db } from '../services/database/index.js';
import { userRepository } from '../services/database/repositories/user.repository.js';
import { hashPassword } from '../utils/crypto.js';

const keepAuth = process.argv.includes('--keep-auth');

async function resetSqlite(): Promise<void> {
  const base = config.database.path;
  for (const file of [base, `${base}-wal`, `${base}-shm`]) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log('Dihapus:', file);
    }
  }
}

async function resetMysql(): Promise<void> {
  const conn = await mysql.createConnection({
    host: config.database.mysql.host,
    port: config.database.mysql.port,
    user: config.database.mysql.user,
    password: config.database.mysql.password,
    database: config.database.mysql.database,
  });

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  const [tables] = await conn.query<TableRow[]>(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
    [config.database.mysql.database],
  );

  for (const row of tables) {
    await conn.query(`DROP TABLE IF EXISTS \`${row.TABLE_NAME}\``);
    console.log('Dihapus tabel:', row.TABLE_NAME);
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
}

async function clearAuthStorage(): Promise<void> {
  const authDir = config.whatsapp.authPath;
  if (!fs.existsSync(authDir)) return;

  for (const entry of fs.readdirSync(authDir, { withFileTypes: true })) {
    if (entry.name === '.gitkeep') continue;
    const target = path.join(authDir, entry.name);
    fs.rmSync(target, { recursive: true, force: true });
    console.log('Dihapus session auth:', entry.name);
  }
}

async function seedAdmin(): Promise<void> {
  const phone = config.admin.phone;
  if (!phone) {
    console.warn('ADMIN_PHONE belum diset — admin tidak dibuat. Set di .env lalu npm run admin:reset');
    return;
  }

  const passwordHash = await hashPassword(config.admin.password);
  const userId = await userRepository.create({
    email: config.admin.email,
    phone_number: phone,
    password_hash: passwordHash,
    name: config.admin.name,
    role: 'super_admin',
  });

  const bundle = await ensureUserBundle(userId, phone, { connect: false });

  console.log('Admin dibuat:');
  console.log(`  Login     : ${phone}`);
  console.log(`  Session   : ${bundle.sessionId}`);
  console.log(`  Password  : (dari ADMIN_PASSWORD di .env)`);
  if (bundle.apiKey) {
    console.log(`  API Key   : ${bundle.apiKey}`);
  }
}

async function main(): Promise<void> {
  console.log('--- Reset Database ---');
  console.log('Driver:', config.database.driver);

  if (config.database.driver === 'mysql') {
    await resetMysql();
  } else {
    await resetSqlite();
  }

  if (!keepAuth) {
    await clearAuthStorage();
  } else {
    console.log('Session WhatsApp (storage/auth) dipertahankan (--keep-auth)');
  }

  await db.connect();
  console.log('Migrasi selesai.');

  await seedAdmin();
  await db.close();

  console.log('\nSelesai. Jalankan server: npm run dev');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
