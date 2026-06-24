-- Add denormalized filter columns for weekly file details filtering.
-- Keep batch req id filtering as-is (join on batch_detail_id -> batches.batch_number).

ALTER TABLE csa.wkl_file_records
ADD COLUMN IF NOT EXISTS transaction_type TEXT GENERATED ALWAYS AS (
    (
        record_data ->> 'transactionType'
    )
) STORED,
ADD COLUMN IF NOT EXISTS cra_status TEXT GENERATED ALWAYS AS (
    NULLIF(
        LOWER(
            REPLACE(
                COALESCE(record_data ->> 'status', ''),
                ' ',
                '-'
            )
        ),
        ''
    )
) STORED,
ADD COLUMN IF NOT EXISTS transaction_source TEXT GENERATED ALWAYS AS (
    CASE
        WHEN UPPER(
            COALESCE(
                record_data ->> 'receiveMode',
                ''
            )
        ) = 'E' THEN 'electronic'
        WHEN COALESCE(
            record_data ->> 'receiveMode',
            ''
        ) = '' THEN 'other'
        ELSE LOWER(record_data ->> 'receiveMode')
    END
) STORED;

CREATE INDEX IF NOT EXISTS idx_wkl_file_records_transaction_type ON csa.wkl_file_records (transaction_type);

CREATE INDEX IF NOT EXISTS idx_wkl_file_records_cra_status ON csa.wkl_file_records (cra_status);

CREATE INDEX IF NOT EXISTS idx_wkl_file_records_transaction_source ON csa.wkl_file_records (transaction_source);
