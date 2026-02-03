-- Trigram extension for substring search (ILIKE '%term%')
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Concatenates searchable text fields Automatically updated by PostgreSQL on INSERT/UPDATE
ALTER TABLE csa.contacts
ADD COLUMN search_text TEXT GENERATED ALWAYS AS (
  coalesce(last_name, '') || ' | ' ||
  coalesce(first_name, '') || ' | ' ||
  coalesce(middle_name, '') || ' | ' ||
  coalesce(aka_last_name, '') || ' | ' ||
  coalesce(aka_first_name, '') || ' | ' ||
  coalesce(case_number, '') || ' | ' ||
  coalesce(legacy_file_number, '') || ' | ' ||
  coalesce(din, '')
) STORED;

ALTER TABLE csa.contacts
ALTER COLUMN search_text SET NOT NULL;

-- Full-text search index (trigram for ILIKE '%term%' queries)
CREATE INDEX idx_contacts_search_text_trgm ON csa.contacts USING GIN (search_text gin_trgm_ops);

CREATE UNIQUE INDEX batches_pending_unique ON csa.batches (status) WHERE status = 'pending';

