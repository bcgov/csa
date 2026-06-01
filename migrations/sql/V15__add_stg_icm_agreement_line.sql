-- OOC agreement lines: join bridge (person id -> agreement header). Line detail lives on agreement/orders.
CREATE TABLE IF NOT EXISTS csa.stg_icm_agreement_line (
  ROW_ID              TEXT PRIMARY KEY,
  AGREEMENT_ROW_ID    TEXT NOT NULL,
  X_CONTACT_NUM       TEXT NOT NULL,
  LAST_UPD            TEXT,
  INGESTED_AT         TIMESTAMPTZ DEFAULT NOW(),
  data_changed_at     TIMESTAMPTZ
);

CREATE INDEX idx_stg_icm_agreement_line_agreement_row_id
  ON csa.stg_icm_agreement_line (AGREEMENT_ROW_ID);

CREATE INDEX idx_stg_icm_agreement_line_x_contact_num
  ON csa.stg_icm_agreement_line (X_CONTACT_NUM);
