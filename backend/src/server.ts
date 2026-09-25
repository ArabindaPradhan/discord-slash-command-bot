import { createApp } from './app';
import { config } from './config';
import { testConnection, closePool } from './config/database';
import { logger } from './utils/logger';

async function start(): Promise<void> {
  // Validate DB connection before accepting traffic
  await testConnection();

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info('Server started', {
      operation: 'server_start',
      port: config.port,
      env: config.env,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Shutdown signal received', { signal });
    server.close(async () => {
      await closePool();
      logger.info('Server closed gracefully');
      process.exit(0);
    });

    // Force exit after 10s if graceful shutdown fails
    setTimeout(() => {
      logger.error('Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      operation: 'unhandled_rejection',
      reason: String(reason),
    });
  });
}

start().catch((err: Error) => {
  logger.error('Failed to start server', {
    operation: 'server_start',
    error: err.message,
  });
  process.exit(1);
});
