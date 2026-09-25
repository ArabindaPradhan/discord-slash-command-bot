// Jest global test setup
// Set test environment variables before any module is loaded

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters-ok';
process.env.DISCORD_APPLICATION_ID = '1234567890';
process.env.DISCORD_PUBLIC_KEY = '0'.repeat(64); // Will be overridden per test file
process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
process.env.PORT = '3002';
process.env.FRONTEND_URL = 'http://localhost:5173';
