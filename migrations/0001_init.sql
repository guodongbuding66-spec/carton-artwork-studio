PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS factories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  crn TEXT NOT NULL,
  country TEXT NOT NULL,
  effective_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  effective_at TEXT,
  preflight_profile_code TEXT,
  template_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(template_id) REFERENCES templates(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_versions_unique ON template_versions(template_id,version);

CREATE TABLE IF NOT EXISTS artworks (
  id TEXT PRIMARY KEY,
  artwork_no TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL,
  contract_no TEXT,
  template_id TEXT,
  factory_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  package_count INTEGER NOT NULL DEFAULT 1,
  current_package INTEGER NOT NULL DEFAULT 1,
  current_revision TEXT NOT NULL DEFAULT 'R01',
  canonical_data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(template_id) REFERENCES templates(id),
  FOREIGN KEY(factory_id) REFERENCES factories(id)
);
CREATE INDEX IF NOT EXISTS idx_artworks_sku ON artworks(sku);
CREATE INDEX IF NOT EXISTS idx_artworks_status ON artworks(status);

CREATE TABLE IF NOT EXISTS artwork_revisions (
  id TEXT PRIMARY KEY,
  artwork_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  data_snapshot_json TEXT NOT NULL,
  template_version_id TEXT,
  preflight_profile_version TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(artwork_id) REFERENCES artworks(id),
  FOREIGN KEY(template_version_id) REFERENCES template_versions(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artwork_revision_unique ON artwork_revisions(artwork_id,revision);

CREATE TABLE IF NOT EXISTS preflight_runs (
  id TEXT PRIMARY KEY,
  artwork_id TEXT NOT NULL,
  revision TEXT,
  profile_code TEXT NOT NULL,
  profile_version TEXT NOT NULL,
  status TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(artwork_id) REFERENCES artworks(id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  artwork_id TEXT NOT NULL,
  revision TEXT,
  author TEXT NOT NULL,
  blocking INTEGER NOT NULL DEFAULT 0,
  resolved INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY(artwork_id) REFERENCES artworks(id)
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  artwork_id TEXT NOT NULL,
  revision TEXT,
  reviewer TEXT NOT NULL,
  decision TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(artwork_id) REFERENCES artworks(id)
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  artwork_id TEXT NOT NULL,
  revision TEXT,
  kind TEXT NOT NULL,
  object_key TEXT,
  sha256 TEXT,
  renderer_version TEXT,
  manifest_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(artwork_id) REFERENCES artworks(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT,
  object_type TEXT NOT NULL,
  object_id TEXT,
  action TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO factories(id,name,crn,country,effective_at) VALUES
('ningbo-a','Ningbo Factory A','3203960FM4','China','2026-01-01'),
('zhejiang-b','Zhejiang Factory B','3307820AB1','China','2026-04-15'),
('vietnam-c','Vietnam Factory C','VN-HCM-88021','Vietnam','2026-08-01');

INSERT OR IGNORE INTO templates(id,code,display_name) VALUES
('tpl-us-side-seal','US_SIDE_SEAL','美线侧封箱');

INSERT OR IGNORE INTO template_versions(
  id,template_id,version,status,effective_at,preflight_profile_code,template_json
) VALUES(
  'tplv-us-side-seal-20260520','tpl-us-side-seal','2026.05.20','APPROVED','2026-05-20','US_SIDE_SEAL_K_ONLY_V1','{}'
);
