import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { userRepository, sessionRepository, auditLogRepository } from '../repositories/userRepository';
import { config } from '../config';
import { logger } from '../utils/logger';

const BCRYPT_ROUNDS = 12;

export const authService = {
  /**
   * Authenticate a user by email and password.
   * Returns a session token (plaintext — hash stored in DB).
   */
  async login(email: string, password: string): Promise<{
    token: string;
    user: { public_id: string; email: string; role: string };
    expiresAt: Date;
  }> {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      // Constant-time comparison to prevent user enumeration
      await bcrypt.compare(password, '$2b$12$invalid_hash_for_timing_safety');
      throw Object.assign(new Error('Invalid email or password'), { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw Object.assign(new Error('Invalid email or password'), { status: 401 });
    }

    // Generate a cryptographically random session token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.session.ttlHours);

    await sessionRepository.create(user.id, tokenHash, expiresAt);

    await auditLogRepository.create(user.id, 'user_login', {
      email: user.email,
    });

    logger.info('User logged in', {
      operation: 'auth_login',
      userId: user.id,
      email: user.email,
    });

    return {
      token: rawToken,  // Return plaintext; store only hash in DB
      user: {
        public_id: user.public_id,
        email: user.email,
        role: user.role,
      },
      expiresAt,
    };
  },

  /**
   * Invalidate a session token.
   */
  async logout(rawToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await sessionRepository.deleteByTokenHash(tokenHash);
    logger.info('User logged out', { operation: 'auth_logout' });
  },

  /**
   * Hash a password. Use for admin setup scripts.
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  },

  /**
   * Clean up expired sessions. Should be called periodically.
   */
  async cleanExpiredSessions(): Promise<number> {
    return sessionRepository.deleteExpired();
  },
};
