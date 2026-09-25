import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limiter for login endpoint — max 10 attempts per 15 min per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please try again later.' },
});

// POST /api/v1/auth/login
router.post('/login', loginLimiter, authController.login);

// POST /api/v1/auth/logout
router.post('/logout', authController.logout);

// GET /api/v1/auth/me — requires authentication
router.get('/me', authenticate, authController.me);

export default router;
