#!/usr/bin/env node
/**
 * Migration runner — reads SQL files from /migrations directory
 * and applies them in order, tracking applied migrations in a
 * schema_migrations table.
 *
 * Usage:
 *   npx ts-node src/scripts/migrate.ts
 *
 * The runner is intentionally simple and dependency-free (uses raw pg).
 * It is NOT intended to handle rollbacks in this version.
 */

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

async function migrate(): Promise<void> {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();

  try {
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get already-applied migrations
    const { rows: applied } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    const appliedSet = new Set(applied.map(r => r.filename));

    // Read migration files sorted
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[SKIP] ${file} — already applied`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`[APPLY] ${file}`);
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      appliedCount++;
      console.log(`[DONE]  ${file}`);
    }

    console.log(`\nMigrations complete. Applied: ${appliedCount}, Skipped: ${files.length - appliedCount}`);

    // Dynamic Admin Setup via environment variables
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
      console.log(`[SEED] Setting up configured admin user: ${adminEmail}`);
      const bcrypt = require('bcrypt') as typeof import('bcrypt');
      const hash = await bcrypt.hash(adminPassword, 12);

      await client.query(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [adminEmail, hash],
      );
      console.log(`[SEED] Configured admin user setup successful.`);
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('[SECURITY WARNING] ADMIN_EMAIL and ADMIN_PASSWORD environment variables are not set. Default development admin seed may be active. Set ADMIN_EMAIL and ADMIN_PASSWORD in production!');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
