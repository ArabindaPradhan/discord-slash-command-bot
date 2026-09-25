import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import authRoutes from './routes/auth';
import discordRoutes from './routes/discord';
import dashboardRoutes from './routes/dashboard';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';


export function createApp(): express.Application {
  const app = express();

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
  }));

  // CORS — allow frontend origin with credentials
  app.use(cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Signature-Ed25519', 'X-Signature-Timestamp'],
  }));

  // Trust proxy if behind a load balancer (Render, Vercel, etc.)
  app.set('trust proxy', 1);

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later' },
  });
  app.use('/api/', limiter);

  // Body parser — applied globally except for the Discord interactions route
  // (which uses captureRawBody middleware for Ed25519 verification)
  app.use((req, res, next) => {
    // Skip body parsing for the Discord interactions endpoint
    if (req.path === '/api/v1/discord/interactions' && req.method === 'POST') {
      return next();
    }
    express.json({ limit: '1mb' })(req, res, next);
  });

  app.use(cookieParser());

  // Health check — no auth required
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'discord-bot-backend',
    });
  });

  // API routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/discord', discordRoutes);
  app.use('/api/v1', dashboardRoutes);

  // 404 and error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
