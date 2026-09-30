PRAGMA foreign_keys = ON;

ALTER TABLE template_versions ADD COLUMN notes TEXT;
ALTER TABLE template_versions ADD COLUMN created_by TEXT;
ALTER TABLE template_versions ADD COLUMN submitted_by TEXT;
ALTER TABLE template_versions ADD COLUMN submitted_at TEXT;
ALTER TABLE template_versions ADD COLUMN approved_by TEXT;
ALTER TABLE template_versions ADD COLUMN approved_at TEXT;
ALTER TABLE template_versions ADD COLUMN updated_at TEXT;

CREATE TABLE IF NOT EXISTS template_approvals (
  id TEXT PRIMARY KEY,
  template_version_id TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('APPROVE','REJECT')),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_template_approvals_version
  ON template_approvals(template_version_id,created_at DESC);

UPDATE template_versions
SET template_json='{"schemaVersion":1,"templateCode":"US_SIDE_SEAL","geometry":{"type":"side-seal-parametric","units":"mm"},"print":{"colors":["K"],"fontPolicy":"Arial-or-similar"},"codeBlock":{"profiles":["250x80","200x64"],"locked":true},"rules":{"multiPackageNotice":true,"crnPlacements":2,"originFromFactory":true}}',
    notes=COALESCE(notes,'Migrated from approved US side-seal source template'),
    created_by=COALESCE(created_by,'system'),
    approved_by=CASE WHEN status='APPROVED' THEN COALESCE(approved_by,'system') ELSE approved_by END,
    approved_at=CASE WHEN status='APPROVED' THEN COALESCE(approved_at,effective_at,created_at) ELSE approved_at END,
    updated_at=COALESCE(updated_at,created_at)
WHERE id='tplv-us-side-seal-20260520' AND (template_json IS NULL OR template_json='{}');
