PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('OPERATOR','REVIEWER','TEMPLATE_DESIGNER','TEMPLATE_APPROVER','ADMIN')),
  granted_by TEXT,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,role),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  actor_email TEXT,
  event_type TEXT NOT NULL,
  method TEXT,
  path TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_artwork_revision
  ON comments(artwork_id,revision,created_at);

CREATE INDEX IF NOT EXISTS idx_comments_blocking_open
  ON comments(artwork_id,revision,blocking,resolved);

CREATE INDEX IF NOT EXISTS idx_approvals_artwork_revision
  ON approvals(artwork_id,revision,created_at);
