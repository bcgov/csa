ALTER TABLE csa.transfer_files
  ADD COLUMN file_type TEXT;

UPDATE csa.transfer_files
SET file_type = CASE
  WHEN direction = 'OUTBOUND' THEN 'REQUEST'
  WHEN file_name ~ '\.[AP]WKL' THEN 'WKL'
  WHEN file_name ~ '\.[AP]RSP' THEN 'RSP'
  ELSE NULL
END;

CREATE INDEX idx_transfer_files_file_type ON csa.transfer_files (file_type);

CREATE TABLE csa.wkl_file_records (
  id               SERIAL PRIMARY KEY,
  transfer_file_id INTEGER NOT NULL REFERENCES csa.transfer_files (id),
  record_index     INTEGER NOT NULL,
  weekly_file_date DATE,
  record_data      JSONB NOT NULL,
  match_status     TEXT NOT NULL,
  contact_id       INTEGER REFERENCES csa.contacts (id),
  batch_detail_id  INTEGER REFERENCES csa.contact_batch_details (id),
  matched_by       TEXT,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_wkl_file_record UNIQUE (transfer_file_id, record_index)
);

CREATE INDEX idx_wkl_file_records_transfer_file ON csa.wkl_file_records (transfer_file_id);
CREATE INDEX idx_wkl_file_records_match_status ON csa.wkl_file_records (match_status);
CREATE INDEX idx_wkl_file_records_contact ON csa.wkl_file_records (contact_id);
