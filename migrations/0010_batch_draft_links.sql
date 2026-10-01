PRAGMA foreign_keys = ON;

ALTER TABLE import_rows ADD COLUMN artwork_id TEXT;
ALTER TABLE import_rows ADD COLUMN draft_created_by TEXT;
ALTER TABLE import_rows ADD COLUMN draft_created_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_import_rows_artwork_id
ON import_rows(artwork_id)
WHERE artwork_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_import_rows_job_status_artwork
ON import_rows(job_id,status,artwork_id);
