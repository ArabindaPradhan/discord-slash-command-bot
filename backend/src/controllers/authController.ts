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
    path: '/',
  };
}

export const authController = {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body as { email?: string; password?: string };

      if (!email || !password) {
        res.status(400).json({ success: false, error: 'Email and password are required' });
        return;
      }

      if (typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ success: false, error: 'Invalid input' });
        return;
      }

      const result = await authService.login(email, password);

      // Set HttpOnly cookie for browser clients
      res.cookie(COOKIE_NAME, result.token, cookieOptions(result.expiresAt));

      res.status(200).json({
        success: true,
        data: {
          user: result.user,
          token: result.token,  // Also return token for API clients
          expiresAt: result.expiresAt,
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
