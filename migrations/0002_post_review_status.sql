PRAGMA foreign_keys = OFF;

CREATE TABLE posts_new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  hazard_level INTEGER NOT NULL CHECK (hazard_level BETWEEN 1 AND 5),
  nsfw INTEGER NOT NULL DEFAULT 0 CHECK (nsfw IN (0, 1)),
  cover_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'published', 'hidden', 'rejected', 'deleted')),
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  deleted_at TEXT
);

INSERT INTO posts_new (
  id, title, slug, summary, content, hazard_level, nsfw, cover_key, status,
  author_id, created_at, updated_at, deleted_at
)
SELECT
  id, title, slug, summary, content, hazard_level, nsfw, cover_key, status,
  author_id, created_at, updated_at, deleted_at
FROM posts;

DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;

CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_hazard_level ON posts(hazard_level);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);

PRAGMA foreign_keys = ON;
