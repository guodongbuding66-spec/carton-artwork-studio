PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reference_records (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL CHECK(namespace IN ('CUSTOMER','PRODUCT','COUNTRY','SHARED')),
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  effective_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reference_records_unique
  ON reference_records(namespace,code);
CREATE INDEX IF NOT EXISTS idx_reference_records_namespace
  ON reference_records(namespace,status,display_name);

CREATE TABLE IF NOT EXISTS production_policies (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  config_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  updated_by TEXT,
  submitted_by TEXT,
  submitted_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS production_policy_approvals (
  id TEXT PRIMARY KEY,
  policy_code TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('APPROVE','REJECT')),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(policy_code) REFERENCES production_policies(code) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_policy_approvals_code
  ON production_policy_approvals(policy_code,created_at DESC);

INSERT OR IGNORE INTO production_policies(code,display_name,status,config_json,notes,updated_by)
VALUES
('BARCODE_POLICY','Barcode Business Policy','DRAFT','{"symbology":"Code128-B","payloadRule":"UNCONFIRMED"}','Final symbology and business payload require approval.','system'),
('QR_POLICY','QR Business Policy','DRAFT','{"ecc":"M","payloadRule":"UNCONFIRMED"}','Final QR payload and ECC require approval.','system'),
('FONT_POLICY','Approved Font Policy','DRAFT','{"font":"Helvetica","embedded":false,"outlined":false}','Current renderer uses PDF core Helvetica and has no approved embedding/outlining gate.','system'),
('PDFX_POLICY','PDF/X Production Policy','DRAFT','{"profile":"UNCONFIRMED"}','PDF/X profile is not yet approved.','system');
