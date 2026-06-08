import { config } from '../config/index.js';
import { hashPassword } from '../utils/crypto.js';
import { userRepository } from './database/repositories/user.repository.js';
import { logger } from './logger/index.js';

export async function bootstrap(): Promise<void> {
  if ((await userRepository.count()) === 0) {
    const passwordHash = await hashPassword(config.admin.password);
    await userRepository.create({
      email: config.admin.email,
      password_hash: passwordHash,
      name: config.admin.name,
      role: 'super_admin',
    });
    logger.warn(
      { email: config.admin.email },
      'Default admin user created — change password immediately',
    );
  }
}
