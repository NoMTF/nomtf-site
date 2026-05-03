ALTER TABLE users ADD COLUMN last_ip TEXT;
ALTER TABLE users ADD COLUMN last_ip_hash TEXT;
ALTER TABLE users ADD COLUMN last_seen_at TEXT;

CREATE TABLE IF NOT EXISTS search_events (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  query_key TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  visitor_id TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_events_created ON search_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_events_query_key_created ON search_events(query_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_ip_hash ON users(last_ip_hash);
