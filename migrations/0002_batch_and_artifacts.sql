PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mapping_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_code TEXT NOT NULL,
  mapping_json TEXT NOT NULL,
  aliases_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  mapping_profile_id TEXT,
  status TEXT NOT NULL DEFAULT 'UPLOADED',
  total_rows INTEGER NOT NULL DEFAULT 0,
  passed_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(mapping_profile_id) REFERENCES mapping_profiles(id)
);

CREATE TABLE IF NOT EXISTS import_rows (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  row_no INTEGER NOT NULL,
  sku TEXT,
  status TEXT NOT NULL,
  canonical_data_json TEXT,
  issues_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_rows_job_row ON import_rows(job_id,row_no);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created ON import_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exports_artwork_revision ON exports(artwork_id,revision,created_at DESC);

INSERT OR IGNORE INTO mapping_profiles(id,name,template_code,mapping_json,aliases_json,created_by)
VALUES(
  'map-us-packing-list-default',
  'US Packing List Default',
  'US_SIDE_SEAL',
  '{"sku":"sku","contractNo":"contractNo","packageCount":"packageCount","currentPackage":"currentPackage","netWeight":"netWeight","grossWeight":"grossWeight","length":"length","width":"width","height":"height","factory":"factory","barcode":"barcode","qr":"qr"}',
  '{}',
  'system'
);
