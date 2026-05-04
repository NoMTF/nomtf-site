CREATE TABLE IF NOT EXISTS user_ip_events (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  colo TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_user_ip_events_user_seen ON user_ip_events(user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_ip_events_ip_hash ON user_ip_events(ip_hash);
