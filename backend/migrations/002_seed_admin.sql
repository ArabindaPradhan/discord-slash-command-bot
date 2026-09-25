-- ============================================================
-- Migration: 002_seed_admin
-- Description: Insert the default admin user
-- Password: Admin@123  (bcrypt hash — change in production!)
-- ============================================================

-- NOTE: The password hash below corresponds to "Admin@123".
-- Replace this with a proper bcrypt hash generated via:
--   node -e "const b=require('bcrypt'); b.hash('YourPassword',12).then(console.log)"
-- This seed is for evaluation only. Change immediately in production.

INSERT INTO users (email, password_hash, role)
VALUES (
  'admin@example.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFKJX1g.zM5CuB6',
  'admin'
)
ON CONFLICT (email) DO NOTHING;
