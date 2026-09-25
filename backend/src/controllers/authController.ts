import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { config } from '../config';


const COOKIE_NAME = 'session_token';

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'lax' as const,
    expires: expiresAt,
    maxAge: config.session.ttlHours * 60 * 60 * 1000,
    path: '/',
  };
}

export const authController = {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body as { email?: string; password?: string };

      if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ success: false, error: 'Email and password are required' });
        return;
      }

      const trimmedEmail = email.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        res.status(400).json({ success: false, error: 'Invalid email format' });
        return;
      }

      const result = await authService.login(trimmedEmail, password);

      // Set HttpOnly cookie for browser clients
      res.cookie(COOKIE_NAME, result.token, cookieOptions(result.expiresAt));

      // Return user info ONLY — never expose session token or internal database IDs in JSON
      res.status(200).json({
        success: true,
        data: {
          user: result.user,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawToken = req.cookies?.[COOKIE_NAME] as string | undefined
        ?? req.headers.authorization?.replace('Bearer ', '');

      if (rawToken) {
        await authService.logout(rawToken);
      }

      res.clearCookie(COOKIE_NAME, { path: '/' });
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated' });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          public_id: req.user.public_id,
          email: req.user.email,
          role: req.user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
