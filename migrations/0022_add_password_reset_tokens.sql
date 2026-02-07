-- Migration 0022: Add password reset tokens

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  used_at TIMESTAMP,
  requested_by_admin_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  requested_from_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_used_at ON password_reset_tokens(used_at);
