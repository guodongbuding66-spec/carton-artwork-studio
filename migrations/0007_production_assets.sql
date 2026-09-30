PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS production_assets (
  id TEXT PRIMARY KEY,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('FONT','ICC_PROFILE')),
  code TEXT NOT NULL,
  version TEXT NOT NULL,
  filename TEXT NOT NULL,
  object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  media_type TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','RETIRED')),
  uploaded_by TEXT,
  submitted_by TEXT,
  submitted_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_assets_unique
  ON production_assets(asset_type,code,version);
CREATE INDEX IF NOT EXISTS idx_production_assets_status
  ON production_assets(asset_type,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS production_asset_approvals (
  id TEXT PRIMARY KEY,
  production_asset_id TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('APPROVE','REJECT')),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(production_asset_id) REFERENCES production_assets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_production_asset_approvals_asset
  ON production_asset_approvals(production_asset_id,created_at DESC);
