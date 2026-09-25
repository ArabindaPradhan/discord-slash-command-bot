-- ============================================================
-- Migration: 001_initial_schema
-- Description: Create all base tables for the application
-- ============================================================

BEGIN;

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  public_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  email        VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role         VARCHAR(50) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_idx  ON users(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx      ON users(email);

-- ============================================================
-- sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
CREATE        INDEX IF NOT EXISTS sessions_user_id_idx    ON sessions(user_id);
CREATE        INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

-- ============================================================
-- discord_servers
-- ============================================================
CREATE TABLE IF NOT EXISTS discord_servers (
  id                         SERIAL PRIMARY KEY,
  public_id                  UUID NOT NULL DEFAULT gen_random_uuid(),
  guild_id                   VARCHAR(30) NOT NULL,
  guild_name                 VARCHAR(255) NOT NULL,
  bot_configured             BOOLEAN NOT NULL DEFAULT FALSE,
  mirror_webhook_configured  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Webhook URL stored encrypted/hashed — never returned to frontend
  mirror_webhook_url         TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS discord_servers_public_id_idx ON discord_servers(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS discord_servers_guild_id_idx  ON discord_servers(guild_id);

-- ============================================================
-- command_configs
-- ============================================================
CREATE TABLE IF NOT EXISTS command_configs (
  id                  SERIAL PRIMARY KEY,
  public_id           UUID NOT NULL DEFAULT gen_random_uuid(),
  discord_server_id   INTEGER NOT NULL REFERENCES discord_servers(id) ON DELETE CASCADE,
  command_name        VARCHAR(100) NOT NULL,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  response_template   TEXT NOT NULL DEFAULT '',
  mirror_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  ai_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS command_configs_public_id_idx ON command_configs(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS command_configs_server_cmd_idx
  ON command_configs(discord_server_id, command_name);

-- ============================================================
-- interactions
-- ============================================================
CREATE TABLE IF NOT EXISTS interactions (
  id                  SERIAL PRIMARY KEY,
  interaction_id      VARCHAR(30) NOT NULL,        -- Discord interaction snowflake ID
  discord_server_id   INTEGER REFERENCES discord_servers(id) ON DELETE SET NULL,
  command_name        VARCHAR(100) NOT NULL,
  interaction_type    INTEGER NOT NULL,
  user_id             VARCHAR(30),
  username            VARCHAR(255),
  input_text          TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'completed', 'failed', 'duplicate')),
  response_status     VARCHAR(20) CHECK (response_status IN ('pending', 'sent', 'failed')),
  mirror_status       VARCHAR(20) CHECK (mirror_status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message       TEXT,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

-- This UNIQUE constraint is the FINAL guard against duplicate interactions.
-- The application also checks first, but the DB constraint is the authoritative lock.
CREATE UNIQUE INDEX IF NOT EXISTS interactions_interaction_id_idx ON interactions(interaction_id);
CREATE        INDEX IF NOT EXISTS interactions_server_id_idx      ON interactions(discord_server_id);
CREATE        INDEX IF NOT EXISTS interactions_received_at_idx    ON interactions(received_at DESC);
CREATE        INDEX IF NOT EXISTS interactions_status_idx         ON interactions(status);

-- ============================================================
-- action_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS action_logs (
  id              SERIAL PRIMARY KEY,
  interaction_id  INTEGER NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  action_type     VARCHAR(100) NOT NULL,
  status          VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  details         JSONB,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_logs_interaction_id_idx ON action_logs(interaction_id);
CREATE INDEX IF NOT EXISTS action_logs_created_at_idx     ON action_logs(created_at DESC);

-- ============================================================
-- audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(255) NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);

COMMIT;
