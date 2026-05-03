ALTER TABLE posts ADD COLUMN rating_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN twitter_ref TEXT NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_hot ON posts(status, view_count DESC, created_at DESC);
