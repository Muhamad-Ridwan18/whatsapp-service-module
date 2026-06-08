import 'dotenv/config';
import { config } from '../config/index.js';
import { db } from '../services/database/index.js';
import { userRepository } from '../services/database/repositories/user.repository.js';
import { verifyPassword } from '../utils/crypto.js';

const email = (process.argv[2] ?? config.admin.email).trim().toLowerCase();
const password = process.argv[3] ?? config.admin.password;

async function main(): Promise<void> {
  console.log('--- WSM Login Diagnostic ---');
  console.log('DB driver :', config.database.driver);
  if (config.database.driver === 'mysql') {
    console.log('MySQL host:', config.database.mysql.host);
    console.log('MySQL db  :', config.database.mysql.database);
  } else {
    console.log('SQLite    :', config.database.path);
  }
  console.log('Test email:', email);
  console.log('');

  await db.connect();

  const user = await userRepository.findByEmail(email);
  if (!user) {
    const any = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM users');
    const byEmail = await db.get<{ email: string; is_active: number }>(
      'SELECT email, is_active FROM users WHERE LOWER(email) = LOWER(?)',
      [email],
    );
    console.log('FAIL: user tidak ditemukan (is_active=1)');
    console.log('Total users di DB:', any?.c ?? 0);
    if (byEmail) {
      console.log('User ada tapi is_active =', byEmail.is_active);
    }
    await db.close();
    process.exit(1);
  }

  const hash = String(user.password_hash).trim();
  const ok = await verifyPassword(password, hash);
  console.log('User found  :', user.email, `(${user.role})`);
  console.log('Hash length :', hash.length);
  console.log('Password OK :', ok ? 'YES' : 'NO');

  if (!ok) {
    console.log('\nJalankan reset password:');
    console.log(`  npm run admin:reset -- --email ${email} --password "PASSWORD_BARU"`);
  }

  await db.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
