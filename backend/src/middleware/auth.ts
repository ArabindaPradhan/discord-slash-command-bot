import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { queryOne } from '../config/database';
import { logger } from '../utils/logger';

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        public_id: string;
        email: string;
        role: string;
      };
    }
  }
}

/**
 * Extract and validate the bearer session token from Authorization header
 * or the session cookie. Attaches user to req.user if valid.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    let rawToken: string | undefined;

    // Prefer Authorization header (Bearer scheme)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      rawToken = authHeader.slice(7);
    }

    // Fallback to HttpOnly cookie
    if (!rawToken && req.cookies?.session_token) {
      rawToken = req.cookies.session_token as string;
    }

    if (!rawToken) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    // Hash the token before DB lookup — we never store plaintext tokens
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const session = await queryOne<{
      user_id: number;
      expires_at: Date;
      id: number;
      public_id: string;
      email: string;
      role: string;
    }>(
      `SELECT s.id, s.user_id, s.expires_at,
              u.public_id, u.email, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > NOW()`,
      [tokenHash],
    );

    if (!session) {
      res.status(401).json({ success: false, error: 'Session expired or invalid' });
      return;
    }

    req.user = {
      id: session.user_id,
      public_id: session.public_id,
      email: session.email,
      role: session.role,
    };

    next();
  } catch (err) {
    logger.error('Authentication middleware error', {
      operation: 'auth_middleware',
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  }
}

/**
 * Require admin role — must be used after `authenticate`.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  next();
}
