import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue = ''): string {
  return process.env[name] ?? defaultValue;
}

function parseCorsOrigins(rawEnv?: string): string[] {
  const defaults = ['http://localhost:5173', 'http://localhost:3001', 'http://127.0.0.1:5173'];
  if (!rawEnv || !rawEnv.trim()) {
    return defaults;
  }
  const customOrigins = rawEnv
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return Array.from(new Set([...defaults, ...customOrigins]));
}

export const config = {
  env: optionalEnv('NODE_ENV', 'development'),
  port: parseInt(optionalEnv('PORT', '3001'), 10),

  database: {
    url: optionalEnv('DATABASE_URL'),
    ssl: optionalEnv('NODE_ENV', 'development') === 'production',
  },

  session: {
    // Session token TTL in hours
    ttlHours: parseInt(optionalEnv('SESSION_TTL_HOURS', '24'), 10),
  },

  discord: {
    applicationId: requireEnv('DISCORD_APPLICATION_ID'),
    publicKey: requireEnv('DISCORD_PUBLIC_KEY'),
    botToken: requireEnv('DISCORD_BOT_TOKEN'),
    clientId: optionalEnv('DISCORD_CLIENT_ID'),
    clientSecret: optionalEnv('DISCORD_CLIENT_SECRET'),
    redirectUri: optionalEnv('DISCORD_REDIRECT_URI'),
    mirrorWebhookUrl: optionalEnv('MIRROR_DISCORD_WEBHOOK_URL'),
    testGuildId: optionalEnv('DISCORD_TEST_GUILD_ID'),
  },

  ai: {
    provider: optionalEnv('AI_PROVIDER', 'gemini'),
    apiKey: optionalEnv('AI_API_KEY'),
  },

  cors: {
    origin: parseCorsOrigins(process.env.FRONTEND_URL),
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
  },
} as const;

export type Config = typeof config;
