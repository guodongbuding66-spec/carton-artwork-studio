PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pdfx_promotion_evidence (
  id TEXT PRIMARY KEY,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('SECONDARY_VALIDATION','RIP_QUALIFICATION','PRODUCTION_TRIAL')),
  profile TEXT NOT NULL DEFAULT 'PDF/X-4',
  artifact_sha256 TEXT,
  validator_name TEXT,
  validator_version TEXT,
  ruleset_id TEXT,
  ruleset_version TEXT,
  ruleset_sha256 TEXT,
  print_service_provider TEXT,
  rip_product TEXT,
  rip_version TEXT,
  output_device TEXT,
  suite TEXT,
  suite_version TEXT,
  conformance_level TEXT,
  tested_at TEXT,
  actual_production_workflow INTEGER NOT NULL DEFAULT 0,
  no_pdf_repair INTEGER NOT NULL DEFAULT 0,
  object_key TEXT NOT NULL,
  evidence_sha256 TEXT NOT NULL,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  uploaded_by TEXT,
  submitted_by TEXT,
  submitted_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pdfx_promotion_evidence_type_status
  ON pdfx_promotion_evidence(evidence_type,status,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pdfx_promotion_evidence_artifact
  ON pdfx_promotion_evidence(artifact_sha256,evidence_type,status);

CREATE TABLE IF NOT EXISTS pdfx_promotion_evidence_approvals (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('APPROVE','REJECT')),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(evidence_id) REFERENCES pdfx_promotion_evidence(id)
);

CREATE INDEX IF NOT EXISTS idx_pdfx_promotion_evidence_approvals
  ON pdfx_promotion_evidence_approvals(evidence_id,created_at DESC);
