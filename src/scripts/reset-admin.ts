import 'dotenv/config';
import { config } from '../config/index.js';
import { db } from '../services/database/index.js';
import { userRepository } from '../services/database/repositories/user.repository.js';
import { hashPassword } from '../utils/crypto.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--email' || arg === '-e') result.email = args[++i] ?? '';
    if (arg === '--password' || arg === '-p') result.password = args[++i] ?? '';
    if (arg === '--name' || arg === '-n') result.name = args[++i] ?? '';
    if (arg === '--force-recreate') result.forceRecreate = 'true';
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const email = args.email || config.admin.email;
  const password = args.password || config.admin.password;
  const name = args.name || config.admin.name;
  const forceRecreate = args.forceRecreate === 'true';

  if (!email || !password) {
    console.error('Usage: npm run admin:reset [-- --email admin@localhost --password secret123 --name "Admin"]');
    console.error('       npm run admin:reset -- --force-recreate   (hapus semua user, buat ulang dari .env)');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('Password minimal 6 karakter.');
    process.exit(1);
  }

  db.connect();
  const passwordHash = await hashPassword(password);

  if (forceRecreate) {
    userRepository.deleteAll();
    userRepository.create({
      email,
      password_hash: passwordHash,
      name,
      role: 'super_admin',
    });
    console.log('Admin dibuat ulang (semua user dihapus):');
    console.log(`  Email   : ${email}`);
    console.log(`  Password: (dari argumen / .env)`);
    console.log(`  Name    : ${name}`);
    db.close();
    return;
  }

  const existing = userRepository.findByEmail(email);
  if (existing) {
    userRepository.updateAdmin(email, { password_hash: passwordHash, name });
    console.log('Password admin berhasil diupdate:');
    console.log(`  Email: ${email}`);
  } else {
    const superAdmin = userRepository.list().find((u) => u.role === 'super_admin');
    if (superAdmin) {
      userRepository.updateAdmin(superAdmin.email, {
        password_hash: passwordHash,
        name,
        new_email: email !== superAdmin.email ? email : undefined,
      });
      console.log('Super admin berhasil diupdate:');
      console.log(`  Email: ${email}`);
    } else {
      userRepository.create({
        email,
        password_hash: passwordHash,
        name,
        role: 'super_admin',
      });
      console.log('Admin baru dibuat:');
      console.log(`  Email: ${email}`);
    }
  }

  console.log('\nLogin dashboard: http://localhost:3000/login');
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
