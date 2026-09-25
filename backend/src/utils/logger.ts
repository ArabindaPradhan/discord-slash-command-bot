import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, json, errors, colorize, simple } = winston.format;

const productionFormat = combine(
  errors({ stack: true }),
  timestamp(),
  json(),
);

const developmentFormat = combine(
  errors({ stack: true }),
  timestamp(),
  colorize(),
  simple(),
);

export const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: config.env === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { service: 'discord-bot-backend' },
  transports: [
    new winston.transports.Console(),
  ],
  // Never log secrets — enforced at call sites, this is a reminder
  // Do NOT log: bot token, public key, webhook URL, AI key, passwords, session tokens
});

/**
 * Sanitize an object before logging — strip known secret fields.
 */
export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    'password', 'password_hash', 'token', 'token_hash', 'botToken',
    'bot_token', 'webhookUrl', 'webhook_url', 'apiKey', 'api_key',
    'publicKey', 'public_key', 'secret', 'authorization', 'cookie',
  ];

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk));
    sanitized[key] = isSensitive ? '[REDACTED]' : value;
  }
  return sanitized;
}
