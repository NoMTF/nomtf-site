ALTER TABLE users ADD COLUMN password_changed_at TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;

ALTER TABLE sessions ADD COLUMN ip_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN user_agent_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;

CREATE TABLE IF NOT EXISTS auth_failures (
  subject TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TEXT NOT NULL,
  last_failed_at TEXT NOT NULL,
  locked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_failures_locked_until ON auth_failures(locked_until);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
