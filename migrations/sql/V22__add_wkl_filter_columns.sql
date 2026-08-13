-- Add denormalized filter columns for weekly file details filtering.
-- Data is populated directly from record_data JSON during record creation/update.
-- Keep batch req id filtering as-is (join on batch_detail_id -> batches.batch_number).

ALTER TABLE csa.wkl_file_records
ADD COLUMN IF NOT EXISTS transaction_type TEXT,
ADD COLUMN IF NOT EXISTS cra_status TEXT,
ADD COLUMN IF NOT EXISTS transaction_source TEXT;

CREATE INDEX IF NOT EXISTS idx_wkl_file_records_transaction_type ON csa.wkl_file_records (transaction_type);

CREATE INDEX IF NOT EXISTS idx_wkl_file_records_cra_status ON csa.wkl_file_records (cra_status);

CREATE INDEX IF NOT EXISTS idx_wkl_file_records_transaction_source ON csa.wkl_file_records (transaction_source);
