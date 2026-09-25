import request from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';

// Mock config module
jest.mock('../src/config', () => ({
  config: {
    env: 'test',
    port: 3002,
    database: { url: 'postgresql://test:test@localhost/testdb', ssl: false },
    session: { ttlHours: 24 },
    discord: {
      applicationId: '1234567890',
      publicKey: '0'.repeat(64),
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

// Mock database module
jest.mock('../src/config/database', () => ({
  getPool: jest.fn(),
  query: jest.fn().mockResolvedValue([]),
  queryOne: jest.fn().mockResolvedValue(null),
  execute: jest.fn().mockResolvedValue(1),
  withTransaction: jest.fn().mockImplementation(async (cb: (client: unknown) => Promise<unknown>) => cb({})),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn().mockResolvedValue(undefined),
}));

import { queryOne, execute } from '../src/config/database';
import { createApp } from '../src/app';

const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;
const mockExecute = execute as jest.MockedFunction<typeof execute>;

describe('Authentication & Session Security Tests', () => {
  let app: express.Application;
  let hashedPassword: string;

  const testUser = {
    id: 1,
    public_id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'admin@example.com',
    password_hash: '', // set in beforeAll
    role: 'admin',
  };

  const viewerUser = {
    id: 2,
    public_id: '987e6543-e21b-12d3-a456-426614174000',
    email: 'viewer@example.com',
    password_hash: '',
    role: 'viewer',
  };

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash('Admin@123', 12);
    testUser.password_hash = hashedPassword;
    viewerUser.password_hash = hashedPassword;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  describe('POST /api/v1/auth/login', () => {
    it('1. valid credentials -> success with HttpOnly cookie and no session token in JSON', async () => {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM users WHERE email =')) {
          return testUser;
        }
        if (sql.includes('INSERT INTO sessions')) {
          return { id: 10 };
        }
        return null;
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'Admin@123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toEqual({
        public_id: testUser.public_id,
        email: testUser.email,
        role: 'admin',
      });

      // Security check: Never return session token, password hash, or internal ID in JSON
      expect(res.body.data.token).toBeUndefined();
      expect(res.body.data.user.id).toBeUndefined();
      expect(res.body.data.user.password_hash).toBeUndefined();

      // Verify Set-Cookie header contains session_token HttpOnly
      const cookies = res.get('Set-Cookie') ?? [];
      const sessionCookie = cookies.find((c: string) => c.startsWith('session_token='));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
    });

    it('2. wrong password -> 401 with generic error message', async () => {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM users WHERE email =')) {
          return testUser;
        }
        return null;
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'WrongPassword123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('3. unknown email -> 401 with generic error message', async () => {
      mockQueryOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'Admin@123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('4. malformed email -> 400 validation error', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'invalid-email-format', password: 'Admin@123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid email format');
    });

    it('5. missing password -> 400 validation error', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Email and password are required');
    });
  });

  describe('GET /api/v1/auth/me & Session Verification', () => {
    it('6. valid session -> authenticated user profile', async () => {
      mockQueryOne.mockResolvedValue({
        id: 10,
        user_id: testUser.id,
        expires_at: new Date(Date.now() + 86400000),
        public_id: testUser.public_id,
        email: testUser.email,
        role: testUser.role,
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', ['session_token=valid_test_token_string']);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        public_id: testUser.public_id,
        email: testUser.email,
        role: 'admin',
      });
    });

    it('7. invalid session -> 401', async () => {
      mockQueryOne.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', ['session_token=invalid_session_token']);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('8. expired session -> 401', async () => {
      // Query returns null because WHERE expires_at > NOW() filters out expired sessions
      mockQueryOne.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', ['session_token=expired_token']);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('9. missing cookie -> 401', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('10. valid logout -> 200 and clears cookie', async () => {
      mockExecute.mockResolvedValue(1);

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', ['session_token=valid_token']);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const cookies = res.get('Set-Cookie') ?? [];
      const clearedCookie = cookies.find((c: string) => c.startsWith('session_token=;'));
      expect(clearedCookie).toBeDefined();
    });

    it('11. logout without session -> 200 (idempotent)', async () => {
      const res = await request(app).post('/api/v1/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('12. repeated logout -> 200 (idempotent)', async () => {
      mockExecute.mockResolvedValue(0);

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', ['session_token=already_logged_out']);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Authorization & Security Guards', () => {
    it('13. protected dashboard route without auth -> 401', async () => {
      const res = await request(app).get('/api/v1/dashboard/stats');
      expect(res.status).toBe(401);
    });

    it('14. authenticated user -> access granted to protected route', async () => {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM sessions s')) {
          return {
            id: 10,
            user_id: testUser.id,
            expires_at: new Date(Date.now() + 86400000),
            public_id: testUser.public_id,
            email: testUser.email,
            role: 'admin',
          };
        }
        if (sql.includes('as total')) {
          return { total: '10', completed: '8', failed: '1', duplicate: '1' };
        }
        return null;
      });

      const res = await request(app)
        .get('/api/v1/dashboard/stats')
        .set('Cookie', ['session_token=valid_admin_token']);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('15. insufficient role (viewer accessing admin route) -> 403', async () => {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM sessions s')) {
          return {
            id: 11,
            user_id: viewerUser.id,
            expires_at: new Date(Date.now() + 86400000),
            public_id: viewerUser.public_id,
            email: viewerUser.email,
            role: 'viewer', // Non-admin role
          };
        }
        return null;
      });

      const res = await request(app)
        .post('/api/v1/discord/register-commands')
        .set('Cookie', ['session_token=valid_viewer_token']);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Admin access required');
    });

    it('16 & 17 & 18. password hash, session token, and internal DB ID are never returned', async () => {
      mockQueryOne.mockResolvedValue({
        id: 10,
        user_id: testUser.id,
        expires_at: new Date(Date.now() + 86400000),
        public_id: testUser.public_id,
        email: testUser.email,
        role: testUser.role,
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', ['session_token=valid_token']);

      expect(res.status).toBe(200);
      const dataStr = JSON.stringify(res.body);
      expect(dataStr).not.toContain(hashedPassword);
      expect(dataStr).not.toContain('valid_token');
      expect(res.body.data.id).toBeUndefined();
      expect(res.body.data.password_hash).toBeUndefined();
    });
  });
});
