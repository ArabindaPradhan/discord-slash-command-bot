import nacl from 'tweetnacl';
import request from 'supertest';
import express from 'express';

// Generate test Ed25519 keypair
const testKeyPair = nacl.sign.keyPair();
const TEST_PUBLIC_KEY = Buffer.from(testKeyPair.publicKey).toString('hex');
const TEST_PRIVATE_KEY = testKeyPair.secretKey;
const APP_ID = '1234567890';

// Mock config module
jest.mock('../src/config', () => ({
  config: {
    env: 'test',
    port: 3002,
    database: { url: 'postgresql://test:test@localhost/testdb', ssl: false },
    session: { ttlHours: 24 },
    discord: {
      applicationId: '1234567890',
      publicKey: Buffer.from(nacl.sign.keyPair().publicKey).toString('hex'), // overridden below
      botToken: 'secret-bot-token-123',
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      mirrorWebhookUrl: 'https://discord.com/api/webhooks/123/secret-webhook-key',
      guildId: '987654321',
    },
    ai: { provider: 'gemini', apiKey: '' },
    cors: { origin: 'http://localhost:5173' },
    rateLimit: { windowMs: 900000, max: 100 },
  },
}));

// Override public key in config mock
// eslint-disable-next-line @typescript-eslint/no-require-imports
const configModule = require('../src/config') as { config: { discord: { publicKey: string } } };
configModule.config.discord.publicKey = TEST_PUBLIC_KEY;

// Mock database layer
jest.mock('../src/config/database', () => ({
  getPool: jest.fn(),
  query: jest.fn().mockResolvedValue([]),
  queryOne: jest.fn().mockResolvedValue(null),
  execute: jest.fn().mockResolvedValue(1),
  withTransaction: jest.fn().mockImplementation(async (cb: (client: unknown) => Promise<unknown>) => cb({})),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn().mockResolvedValue(undefined),
}));

// Mock Discord API client to inspect outgoing webhook/API calls without live network requests
jest.mock('../src/integrations/discord/discordApiClient', () => ({
  discordApiClient: {
    sendWebhookMessage: jest.fn().mockResolvedValue(undefined),
    editInteractionResponse: jest.fn().mockResolvedValue(undefined),
    registerSlashCommands: jest.fn().mockResolvedValue(undefined),
    getGuildInfo: jest.fn().mockResolvedValue({ id: '987654321', name: 'Test Guild' }),
  },
}));

import { queryOne } from '../src/config/database';
import { discordApiClient } from '../src/integrations/discord/discordApiClient';
import { createApp } from '../src/app';

const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;

function signBody(body: string, timestamp: string): string {
  const message = Buffer.concat([
    Buffer.from(timestamp, 'utf-8'),
    Buffer.from(body, 'utf-8'),
  ]);
  const signature = nacl.sign.detached(message, TEST_PRIVATE_KEY);
  return Buffer.from(signature).toString('hex');
}

describe('Discord Interaction & Business Logic Tests', () => {
  let app: express.Application;
  const ENDPOINT = '/api/v1/discord/interactions';

  const mockServer = {
    id: 1,
    public_id: 'srv-123',
    guild_id: '987654321',
    guild_name: 'Test Guild',
    bot_configured: true,
    mirror_webhook_configured: true,
  };

  const mockCommandConfig = {
    id: 1,
    public_id: 'cmd-123',
    discord_server_id: 1,
    command_name: 'status',
    enabled: true,
    response_template: 'System is operational. ✅',
    mirror_enabled: true,
    ai_enabled: false,
  };

  const mockInteractionRow = {
    id: 100,
    interaction_id: 'int-123',
    discord_server_id: 1,
    command_name: 'status',
    interaction_type: 2,
    user_id: 'usr-1',
    username: 'TestUser',
    input_text: null,
    status: 'pending',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configModule.config.discord.publicKey = TEST_PUBLIC_KEY;
    app = createApp();
  });

  describe('Slash Commands & Handling', () => {
    it('9. /status command execution -> success response and mirror trigger', async () => {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM discord_servers WHERE guild_id')) return mockServer;
        if (sql.includes('INSERT INTO interactions')) return mockInteractionRow;
        if (sql.includes('FROM command_configs WHERE')) return mockCommandConfig;
        if (sql.includes('INSERT INTO action_logs')) return { id: 1, interaction_id: 100, action_type: 'test', status: 'success', created_at: new Date() };
        if (sql.includes('SELECT mirror_webhook_url FROM discord_servers')) return { mirror_webhook_url: 'https://discord.com/api/webhooks/123/abc' };
        return null;
      });

      const body = JSON.stringify({
        type: 2,
        id: 'int-status-1',
        application_id: APP_ID,
        token: 'test-token',
        version: 1,
        guild_id: '987654321',
        data: { name: 'status', id: 'cmd-1' },
        member: { user: { id: 'usr-1', username: 'TestUser' } },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signBody(body, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        type: 4,
        data: { content: 'System is operational. ✅' },
      });
    });

    it('10. /report command execution with text option -> success response', async () => {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM discord_servers WHERE guild_id')) return mockServer;
        if (sql.includes('INSERT INTO interactions')) return { ...mockInteractionRow, command_name: 'report', input_text: 'Checkout bug' };
        if (sql.includes('FROM command_configs WHERE')) return { ...mockCommandConfig, command_name: 'report', response_template: 'Report received: "{{text}}"' };
        if (sql.includes('INSERT INTO action_logs')) return { id: 1, interaction_id: 100, action_type: 'test', status: 'success', created_at: new Date() };
        if (sql.includes('SELECT mirror_webhook_url FROM discord_servers')) return { mirror_webhook_url: 'https://discord.com/api/webhooks/123/abc' };
        return null;
      });

      const body = JSON.stringify({
        type: 2,
        id: 'int-report-1',
        application_id: APP_ID,
        token: 'test-token',
        version: 1,
        guild_id: '987654321',
        data: {
          name: 'report',
          id: 'cmd-2',
          options: [{ name: 'text', type: 3, value: 'Checkout bug' }],
        },
        member: { user: { id: 'usr-1', username: 'TestUser' } },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signBody(body, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        type: 4,
        data: { content: 'Your report has been received: "Checkout bug"' },
      });
    });

    it('11. unknown command -> graceful error response', async () => {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM discord_servers WHERE guild_id')) return mockServer;
        if (sql.includes('INSERT INTO interactions')) return { ...mockInteractionRow, command_name: 'unknown_cmd' };
        return null;
      });

      const body = JSON.stringify({
        type: 2,
        id: 'int-unknown-1',
        application_id: APP_ID,
        token: 'test-token',
        version: 1,
        guild_id: '987654321',
        data: { name: 'unknown_cmd', id: 'cmd-3' },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signBody(body, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.data.content).toContain('Unknown command');
    });

    it('12. disabled command -> graceful disabled message', async () => {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM discord_servers WHERE guild_id')) return mockServer;
        if (sql.includes('INSERT INTO interactions')) return mockInteractionRow;
        if (sql.includes('command_configs')) return { ...mockCommandConfig, enabled: false };
        if (sql.includes('INSERT INTO action_logs')) return { id: 1, interaction_id: 100, action_type: 'test', status: 'success', created_at: new Date() };
        return null;
      });

      const body = JSON.stringify({
        type: 2,
        id: 'int-disabled-1',
        application_id: APP_ID,
        token: 'test-token',
        version: 1,
        guild_id: '987654321',
        data: { name: 'status', id: 'cmd-1' },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signBody(body, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.data.content).toContain('command is currently disabled');
    });

    it('13. unknown/unregistered guild -> safe error explaining server not configured', async () => {
      // Return null for findByGuildId
      mockQueryOne.mockResolvedValue(null);

      const body = JSON.stringify({
        type: 2,
        id: 'int-unreg-1',
        application_id: APP_ID,
        token: 'test-token',
        version: 1,
        guild_id: '99999999999', // unregistered guild ID
        data: { name: 'status', id: 'cmd-1' },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signBody(body, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.data.content).toContain('not been configured in the bot dashboard');
    });

    it('14. wrong application ID -> reject safely', async () => {
      const body = JSON.stringify({
        type: 2,
        id: 'int-wrong-app-1',
        application_id: '999999999999999', // mismatching application_id
        token: 'test-token',
        version: 1,
        guild_id: '987654321',
        data: { name: 'status', id: 'cmd-1' },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signBody(body, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        type: 4,
        data: { content: 'Invalid application ID.' },
      });
    });
  });

  describe('Idempotency & Duplicate Interactions', () => {
    it('15. duplicate interaction -> return early without executing twice or mutating status', async () => {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM discord_servers WHERE guild_id')) return mockServer;
        if (sql.includes('INSERT INTO interactions')) {
          // Simulate PostgreSQL unique constraint violation 23505
          const err = new Error('duplicate key value violates unique constraint');
          Object.assign(err, { code: '23505' });
          throw err;
        }
        if (sql.includes('SELECT * FROM interactions WHERE interaction_id')) {
          return { ...mockInteractionRow, status: 'completed' };
        }
        return null;
      });

      const body = JSON.stringify({
        type: 2,
        id: 'duplicate-int-id',
        application_id: APP_ID,
        token: 'test-token',
        version: 1,
        guild_id: '987654321',
        data: { name: 'status', id: 'cmd-1' },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signBody(body, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.data.content).toContain('already processed');

      // Verify sendWebhookMessage was NOT called for duplicate
      expect(discordApiClient.sendWebhookMessage).not.toHaveBeenCalled();
    });
  });

  describe('Mirror Notification & Security Isolation', () => {
    it('17 & 18. mirror webhook failure does not fail the primary Discord interaction', async () => {
      (discordApiClient.sendWebhookMessage as jest.Mock).mockRejectedValueOnce(new Error('Webhook 500 error'));

      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM discord_servers WHERE guild_id')) return mockServer;
        if (sql.includes('INSERT INTO interactions')) return mockInteractionRow;
        if (sql.includes('FROM command_configs WHERE')) return mockCommandConfig;
        if (sql.includes('INSERT INTO action_logs')) return { id: 1, interaction_id: 100, action_type: 'test', status: 'success', created_at: new Date() };
        if (sql.includes('SELECT mirror_webhook_url FROM discord_servers')) return { mirror_webhook_url: 'https://discord.com/api/webhooks/123/abc' };
        return null;
      });

      const body = JSON.stringify({
        type: 2,
        id: 'int-mirror-fail',
        application_id: APP_ID,
        token: 'test-token',
        version: 1,
        guild_id: '987654321',
        data: { name: 'status', id: 'cmd-1' },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signBody(body, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      // Primary interaction response must STILL succeed (200 OK with content)
      expect(res.status).toBe(200);
      expect(res.body.data.content).toBe('System is operational. ✅');
    });

    it('19 & 20. bot token and webhook URL are NEVER returned in API responses', async () => {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM discord_servers WHERE guild_id')) return mockServer;
        if (sql.includes('INSERT INTO interactions')) return mockInteractionRow;
        if (sql.includes('FROM command_configs WHERE')) return mockCommandConfig;
        if (sql.includes('INSERT INTO action_logs')) return { id: 1, interaction_id: 100, action_type: 'test', status: 'success', created_at: new Date() };
        return null;
      });

      const body = JSON.stringify({
        type: 2,
        id: 'int-sec-check',
        application_id: APP_ID,
        token: 'test-token',
        version: 1,
        guild_id: '987654321',
        data: { name: 'status', id: 'cmd-1' },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signBody(body, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      const resStr = JSON.stringify(res.body);
      expect(resStr).not.toContain('secret-bot-token-123');
      expect(resStr).not.toContain('secret-webhook-key');
    });
  });
});
