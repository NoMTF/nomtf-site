ALTER TABLE posts ADD COLUMN category TEXT NOT NULL DEFAULT 'rating';
ALTER TABLE posts ADD COLUMN pinned_at TEXT;
ALTER TABLE posts ADD COLUMN pinned_by TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_category_status_pinned ON posts(category, status, pinned_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_pinned ON posts(status, pinned_at DESC);
