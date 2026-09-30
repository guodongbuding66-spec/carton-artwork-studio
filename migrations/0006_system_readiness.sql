PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS system_readiness_runs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PASS','FAIL')),
  report_json TEXT NOT NULL DEFAULT '{}',
  actor TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_system_readiness_runs_scope_time
  ON system_readiness_runs(scope,created_at DESC);
