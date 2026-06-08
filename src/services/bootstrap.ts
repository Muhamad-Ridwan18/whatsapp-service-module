import { config } from '../config/index.js';
import { hashPassword } from '../utils/crypto.js';
import { ensureUserBundle } from './account/account.service.js';
import { sessionRepository } from './database/repositories/session.repository.js';
import { userRepository } from './database/repositories/user.repository.js';
import { logger } from './logger/index.js';

export async function bootstrap(): Promise<void> {
  if ((await userRepository.count()) === 0) {
    const passwordHash = await hashPassword(config.admin.password);
    const userId = await userRepository.create({
      email: config.admin.email,
      phone_number: config.admin.phone,
      password_hash: passwordHash,
      name: config.admin.name,
      role: 'super_admin',
    });
    if (!config.admin.phone) {
      logger.warn(
        'Default admin dibuat tanpa ADMIN_PHONE — set ADMIN_PHONE di .env lalu jalankan npm run admin:reset',
      );
    } else {
      await ensureUserBundle(userId, config.admin.phone, { connect: false });
    }
    logger.warn(
      { phone: config.admin.phone ?? '(belum diset)' },
      'Default admin user created — change password immediately',
    );
    return;
  }

  const users = await userRepository.list();
  for (const user of users) {
    if (user.role !== 'super_admin' || !user.phone_number) continue;
    if (await sessionRepository.findByUserId(user.id)) continue;
    await ensureUserBundle(user.id, user.phone_number, { connect: false });
    logger.info({ phone: user.phone_number }, 'Super admin bundle dipulihkan (session + API key)');
  }
}
