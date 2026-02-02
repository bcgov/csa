-- Add tsvector column for full-text search across 11 contact fields
ALTER TABLE csa.contacts
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  to_tsvector('pg_catalog.english'::regconfig,
    coalesce(last_name, '') || ' ' ||
    coalesce(middle_name, '') || ' ' ||
    coalesce(first_name, '') || ' ' ||
    coalesce(gender, '') || ' ' ||
    coalesce(din, '') || ' ' ||
    coalesce(csa_status, '') || ' ' ||
    coalesce(case_number, '') || ' ' ||
    coalesce(csa_status, '') || ' ' ||
    coalesce(legacy_file_number, '') || ' ' ||
    coalesce(hold_by, '') || ' ' ||
    coalesce(last_updated_by, '')
  )
) STORED;

CREATE INDEX idx_contacts_search_vector ON csa.contacts USING GIN (search_vector);

CREATE UNIQUE INDEX batches_pending_unique ON csa.batches (status) WHERE status = 'pending';
