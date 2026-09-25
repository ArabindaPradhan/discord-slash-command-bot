import { query, queryOne, execute, withTransaction } from '../config/database';
import { User } from '../types';

export const userRepository = {
  async findByEmail(email: string): Promise<User | null> {
    return queryOne<User>(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()],
    );
  },

  async findById(id: number): Promise<User | null> {
    return queryOne<User>(
      'SELECT * FROM users WHERE id = $1',
      [id],
    );
  },

  async findByPublicId(publicId: string): Promise<User | null> {
    return queryOne<User>(
      'SELECT * FROM users WHERE public_id = $1',
      [publicId],
    );
  },

  async create(email: string, passwordHash: string, role: 'admin' | 'viewer' = 'admin'): Promise<User> {
    const user = await queryOne<User>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email.toLowerCase().trim(), passwordHash, role],
    );
    if (!user) throw new Error('Failed to create user');
    return user;
  },

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await execute(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId],
    );
  },
};

export const sessionRepository = {
  async create(userId: number, tokenHash: string, expiresAt: Date): Promise<{ id: number }> {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, tokenHash, expiresAt],
    );
    if (!row) throw new Error('Failed to create session');
    return row;
  },

  async findByTokenHash(tokenHash: string): Promise<{
    id: number;
    user_id: number;
    expires_at: Date;
  } | null> {
    return queryOne(
      `SELECT id, user_id, expires_at FROM sessions
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash],
    );
  },

  async deleteByTokenHash(tokenHash: string): Promise<number> {
    return execute(
      'DELETE FROM sessions WHERE token_hash = $1',
      [tokenHash],
    );
  },

  async deleteExpired(): Promise<number> {
    return execute('DELETE FROM sessions WHERE expires_at <= NOW()');
  },

  async deleteAllForUser(userId: number): Promise<number> {
    return execute('DELETE FROM sessions WHERE user_id = $1', [userId]);
  },
};

export const auditLogRepository = {
  async create(
    userId: number | null,
    action: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await execute(
      `INSERT INTO audit_logs (user_id, action, metadata)
       VALUES ($1, $2, $3)`,
      [userId, action, metadata ? JSON.stringify(metadata) : null],
    );
  },

  async findRecent(limit = 50): Promise<Array<{
    id: number;
    user_id: number | null;
    action: string;
    metadata: Record<string, unknown> | null;
    created_at: Date;
  }>> {
    return query(
      `SELECT al.*, u.email as user_email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT $1`,
      [limit],
    );
  },
};

export { withTransaction };
