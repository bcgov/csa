-- Backfill raw file values for denormalized WKL filter columns.
--
-- These columns intentionally store the original values from record_data.
-- Any display normalization is handled in the backend API layer.

UPDATE csa.wkl_file_records
SET
    transaction_type = CASE
        WHEN record_data ? 'transactionType' THEN TRIM(
            COALESCE(
                record_data ->> 'transactionType',
                ''
            )
        )
        ELSE NULL
    END,
    cra_status = CASE
        WHEN record_data ? 'status' THEN TRIM(
            COALESCE(record_data ->> 'status', '')
        )
        ELSE NULL
    END,
    transaction_source = CASE
        WHEN record_data ? 'receiveMode' THEN TRIM(
            COALESCE(
                record_data ->> 'receiveMode',
                ''
            )
        )
        ELSE NULL
    END;
