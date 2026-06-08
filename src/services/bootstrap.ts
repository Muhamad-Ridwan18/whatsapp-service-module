import { config } from '../config/index.js';
import { hashPassword } from '../utils/crypto.js';
import { userRepository } from './database/repositories/user.repository.js';
import { logger } from './logger/index.js';

export async function bootstrap(): Promise<void> {
  if ((await userRepository.count()) === 0) {
    const passwordHash = await hashPassword(config.admin.password);
    await userRepository.create({
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
    }
    logger.warn(
      { phone: config.admin.phone ?? '(belum diset)' },
      'Default admin user created — change password immediately',
    );
  }
}
