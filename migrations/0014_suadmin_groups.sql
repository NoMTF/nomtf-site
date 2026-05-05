CREATE TABLE IF NOT EXISTS user_groups (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, group_name)
);

CREATE INDEX IF NOT EXISTS idx_user_groups_group ON user_groups(group_name, user_id);

UPDATE users
SET role = 'admin', status = 'active', updated_at = datetime('now')
WHERE email = '1@1';

INSERT OR IGNORE INTO user_groups (user_id, group_name, created_at)
SELECT id, 'SUadmin', datetime('now')
FROM users
WHERE email = '1@1';
