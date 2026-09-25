import nacl from 'tweetnacl';
import request from 'supertest';
import express from 'express';

// Generate a test Ed25519 keypair — must happen before any module that reads process.env
const testKeyPair = nacl.sign.keyPair();
const TEST_PUBLIC_KEY = Buffer.from(testKeyPair.publicKey).toString('hex');
const TEST_PRIVATE_KEY = testKeyPair.secretKey;

/**
 * Mock the config module so the public key is always the test key pair.
 * This MUST be before any import of ../src/app to avoid the cached module issue.
 */
jest.mock('../src/config', () => ({
  config: {
    env: 'test',
    port: 3002,
    database: { url: 'postgresql://test:test@localhost/testdb', ssl: false },
    jwt: { secret: 'test-secret-32-chars-minimum-ok!', expiresIn: '24h' },
    session: { ttlHours: 24 },
    discord: {
      applicationId: '1234567890',
      publicKey: Buffer.from(nacl.sign.keyPair().publicKey).toString('hex'), // placeholder, overridden below
      botToken: 'test-bot-token',
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      mirrorWebhookUrl: '',
      guildId: '',
    },
    ai: { provider: 'gemini', apiKey: '' },
    cors: { origin: 'http://localhost:5173' },
    rateLimit: { windowMs: 900000, max: 100 },
  },
}));

// Override the publicKey in the mock after we know our test keypair
// We do this by re-requiring and mutating the mock object
// eslint-disable-next-line @typescript-eslint/no-require-imports
const configModule = require('../src/config') as { config: { discord: { publicKey: string } } };
configModule.config.discord.publicKey = TEST_PUBLIC_KEY;

// Mock the database module so tests don't need a real DB
jest.mock('../src/config/database', () => ({
  getPool: jest.fn(),
  query: jest.fn().mockResolvedValue([]),
  queryOne: jest.fn().mockResolvedValue(null),
  execute: jest.fn().mockResolvedValue(0),
  withTransaction: jest.fn().mockImplementation(async (cb: (client: unknown) => Promise<unknown>) => {
    return cb({});
  }),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn().mockResolvedValue(undefined),
}));

// Mock the interaction handler to isolate signature verification tests
jest.mock('../src/integrations/discord/interactionHandler', () => ({
  handleInteraction: jest.fn().mockResolvedValue({ type: 4, data: { content: 'ok' } }),
}));

// Import app AFTER mocks are set up
import { createApp } from '../src/app';

/**
 * Sign a request body the same way Discord does.
 */
function signBody(body: string, timestamp: string): string {
  const message = Buffer.concat([
    Buffer.from(timestamp, 'utf-8'),
    Buffer.from(body, 'utf-8'),
  ]);
  const signature = nacl.sign.detached(message, TEST_PRIVATE_KEY);
  return Buffer.from(signature).toString('hex');
}

let app: express.Application;

beforeEach(() => {
  // Ensure config has correct public key before each test
  configModule.config.discord.publicKey = TEST_PUBLIC_KEY;
  app = createApp();
});

describe('Discord Signature Verification', () => {
  const ENDPOINT = '/api/v1/discord/interactions';

  describe('PING handling', () => {
    it('should respond to PING with type 1', async () => {
      const body = JSON.stringify({ type: 1, id: 'ping-1', application_id: '123', token: 'test', version: 1 });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signBody(body, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ type: 1 });
    });
  });

  describe('Valid signature', () => {
    it('should pass through with a valid signature', async () => {
      const body = JSON.stringify({
        type: 2,
        id: 'interaction-1',
        application_id: '123',
        token: 'test',
        version: 1,
        data: { name: 'status', id: '1' },
        guild_id: '987654321',
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signBody(body, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      // Should pass signature check and reach the handler
      expect(res.status).toBe(200);
    });
  });

  describe('Invalid signature', () => {
    it('should return 401 for a tampered signature', async () => {
      const body = JSON.stringify({ type: 1, id: 'bad-sig', application_id: '123', token: 'test', version: 1 });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      // Use a random invalid signature
      const badSignature = Buffer.from(nacl.randomBytes(64)).toString('hex');

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', badSignature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      expect(res.status).toBe(401);
    });

    it('should return 401 for a signature over a different body', async () => {
      const body = JSON.stringify({ type: 1, id: 'tampered', application_id: '123', token: 'test', version: 1 });
      const differentBody = JSON.stringify({ type: 1, id: 'different', application_id: '123', token: 'test', version: 1 });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      // Sign the different body, send original body
      const signature = signBody(differentBody, timestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      expect(res.status).toBe(401);
    });

    it('should return 401 for an expired timestamp (>5 minutes old)', async () => {
      const body = JSON.stringify({ type: 1, id: 'expired-ts', application_id: '123', token: 'test', version: 1 });
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 minutes ago
      const signature = signBody(body, oldTimestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', oldTimestamp)
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid request timestamp' });
    });

    it('should return 401 for a malformed non-numeric timestamp', async () => {
      const body = JSON.stringify({ type: 1, id: 'bad-ts', application_id: '123', token: 'test', version: 1 });
      const invalidTimestamp = 'not-a-timestamp';
      const signature = signBody(body, invalidTimestamp);

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .set('X-Signature-Timestamp', invalidTimestamp)
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid request timestamp' });
    });
  });

  describe('Missing signature headers', () => {
    it('should return 401 when X-Signature-Ed25519 is missing', async () => {
      const body = JSON.stringify({ type: 1, id: 'missing-sig', application_id: '123', token: 'test', version: 1 });
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Timestamp', timestamp)
        .send(body);

      expect(res.status).toBe(401);
    });

    it('should return 401 when X-Signature-Timestamp is missing', async () => {
      const body = JSON.stringify({ type: 1, id: 'missing-ts', application_id: '123', token: 'test', version: 1 });
      const signature = signBody(body, '12345');

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .set('X-Signature-Ed25519', signature)
        .send(body);

      expect(res.status).toBe(401);
    });

    it('should return 401 when both signature headers are missing', async () => {
      const body = JSON.stringify({ type: 1, id: 'no-headers', application_id: '123', token: 'test', version: 1 });

      const res = await request(app)
        .post(ENDPOINT)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(res.status).toBe(401);
    });
  });

  describe('Authentication protection', () => {
    it('should reject unauthenticated requests to dashboard stats', async () => {
      const res = await request(app).get('/api/v1/dashboard/stats');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated requests to interactions list', async () => {
      const res = await request(app).get('/api/v1/interactions');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated requests to Discord servers list', async () => {
      const res = await request(app).get('/api/v1/discord/servers');
      expect(res.status).toBe(401);
    });
  });
});
