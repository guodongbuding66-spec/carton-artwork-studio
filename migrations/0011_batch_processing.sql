PRAGMA foreign_keys = ON;

ALTER TABLE import_rows ADD COLUMN batch_preflight_status TEXT;
ALTER TABLE import_rows ADD COLUMN batch_preflight_run_id TEXT;
ALTER TABLE import_rows ADD COLUMN batch_preflight_at TEXT;
ALTER TABLE import_rows ADD COLUMN batch_submit_status TEXT;
ALTER TABLE import_rows ADD COLUMN batch_submitted_at TEXT;
ALTER TABLE import_rows ADD COLUMN batch_process_error TEXT;

CREATE INDEX IF NOT EXISTS idx_import_rows_job_batch_preflight
ON import_rows(job_id,batch_preflight_status,batch_preflight_at);

CREATE INDEX IF NOT EXISTS idx_import_rows_job_batch_submit
ON import_rows(job_id,batch_submit_status,batch_submitted_at);
