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

export const config = {
  env: optionalEnv('NODE_ENV', 'development'),
  port: parseInt(optionalEnv('PORT', '3001'), 10),

  database: {
    url: requireEnv('DATABASE_URL'),
    ssl: optionalEnv('NODE_ENV', 'development') === 'production',
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '24h'),
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
    guildId: optionalEnv('DISCORD_GUILD_ID'),
  },

  ai: {
    provider: optionalEnv('AI_PROVIDER', 'gemini'),
    apiKey: optionalEnv('AI_API_KEY'),
  },

  cors: {
    origin: optionalEnv('FRONTEND_URL', 'http://localhost:5173'),
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
  },
} as const;

export type Config = typeof config;
