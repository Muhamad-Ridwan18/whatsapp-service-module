import 'dotenv/config';
import { config } from '../config/index.js';
import { ensureUserBundle } from '../services/account/account.service.js';
import { db } from '../services/database/index.js';
import { userRepository } from '../services/database/repositories/user.repository.js';
import { hashPassword } from '../utils/crypto.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--email' || arg === '-e') result.email = args[++i] ?? '';
    if (arg === '--phone') result.phone = args[++i] ?? '';
    if (arg === '--password' || arg === '-p') result.password = args[++i] ?? '';
    if (arg === '--name' || arg === '-n') result.name = args[++i] ?? '';
    if (arg === '--force-recreate') result.forceRecreate = 'true';
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const email = args.email || config.admin.email;
  const phone = args.phone || config.admin.phone || null;
  const password = args.password || config.admin.password;
  const name = args.name || config.admin.name;
  const forceRecreate = args.forceRecreate === 'true';

  if (!email || !password) {
    console.error('Usage: npm run admin:reset [-- --phone 628000000000 --password secret123 --name "Admin"]');
    console.error('       npm run admin:reset -- --force-recreate   (hapus semua user, buat ulang dari .env)');
    process.exit(1);
  }

  if (!phone) {
    console.error('ADMIN_PHONE wajib untuk login dashboard. Set di .env atau --phone 628...');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('Password minimal 6 karakter.');
    process.exit(1);
  }

  await db.connect();
  const passwordHash = await hashPassword(password);

  if (forceRecreate) {
    await userRepository.deleteAll();
    const userId = await userRepository.create({
      email,
      phone_number: phone,
      password_hash: passwordHash,
      name,
      role: 'super_admin',
    });
    const bundle = await ensureUserBundle(userId, phone!, { connect: false });
    console.log('Admin dibuat ulang (semua user dihapus):');
    console.log(`  Login     : ${phone}`);
    console.log(`  Session   : ${bundle.sessionId}`);
    console.log(`  Password  : (dari argumen / .env)`);
    console.log(`  Name      : ${name}`);
    if (bundle.apiKey) {
      console.log(`  API Key   : ${bundle.apiKey}`);
    }
    await db.close();
    return;
  }

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    await userRepository.updateAdmin(email, {
      password_hash: passwordHash,
      name,
      phone_number: phone ?? undefined,
    });
    console.log('Password admin berhasil diupdate:');
    console.log(`  Login: ${phone}`);
  } else {
    const users = await userRepository.list();
    const superAdmin = users.find((u) => u.role === 'super_admin');
    if (superAdmin) {
      await userRepository.updateAdmin(superAdmin.email, {
        password_hash: passwordHash,
        name,
        new_email: email !== superAdmin.email ? email : undefined,
        phone_number: phone ?? undefined,
      });
      console.log('Super admin berhasil diupdate:');
      console.log(`  Login: ${phone}`);
    } else {
      const userId = await userRepository.create({
        email,
        phone_number: phone,
        password_hash: passwordHash,
        name,
        role: 'super_admin',
      });
      if (phone) {
        await ensureUserBundle(userId, phone, { connect: false });
      }
      console.log('Admin baru dibuat:');
      console.log(`  Login: ${phone}`);
    }
  }

  if (phone) {
    const users = await userRepository.list();
    const superAdmin = users.find((u) => u.role === 'super_admin' && u.phone_number === phone);
    if (superAdmin) {
      await ensureUserBundle(superAdmin.id, phone, { connect: false });
    }
  }

  console.log('\nLogin dashboard: http://localhost:3000/login');
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
