import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected error on idle database client', {
        operation: 'db_pool_error',
        error: err.message,
      });
    });

    pool.on('connect', () => {
      logger.debug('New database client connected', { operation: 'db_pool_connect' });
    });
  }

  return pool;
}

/**
 * Execute a query using a pool client — preferred for single queries.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T extends Record<string, any> = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const db = getPool();
  const result = await db.query<T>(sql, params);
  return result.rows;
}

/**
 * Execute a query and return the first row or null.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function queryOne<T extends Record<string, any> = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Execute a query and return the number of affected rows.
 */
export async function execute(sql: string, params?: unknown[]): Promise<number> {
  const db = getPool();
  const result = await db.query(sql, params);
  return result.rowCount ?? 0;
}

/**
 * Run multiple queries inside a single transaction.
 * Automatically rolls back on error.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Test the database connection — used during startup health check.
 */
export async function testConnection(): Promise<void> {
  const rows = await query<{ now: Date }>('SELECT NOW()');
  logger.info('Database connection established', {
    operation: 'db_health_check',
    timestamp: rows[0]?.now,
  });
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed', { operation: 'db_pool_close' });
  }
}
