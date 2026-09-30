PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pdfx_validation_runs (
  id TEXT PRIMARY KEY,
  artwork_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  profile TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  validator_name TEXT NOT NULL,
  validator_version TEXT,
  status TEXT NOT NULL CHECK(status IN ('PASS','FAIL','ERROR')),
  report_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(artwork_id) REFERENCES artworks(id)
);
CREATE INDEX IF NOT EXISTS idx_pdfx_validation_runs_artwork
  ON pdfx_validation_runs(artwork_id,revision,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdfx_validation_runs_sha
  ON pdfx_validation_runs(artifact_sha256,profile,status,created_at DESC);
