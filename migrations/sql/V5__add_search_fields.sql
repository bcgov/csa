-- Add hold_by and last_updated_by to search_text generated column

ALTER TABLE csa.contacts DROP COLUMN search_text;

ALTER TABLE csa.contacts
  ADD COLUMN search_text TEXT GENERATED ALWAYS AS (
    coalesce(last_name, '') || ' | ' || coalesce(first_name, '') || ' | ' || coalesce(middle_name, '') || ' | ' || coalesce(aka_last_name, '') || ' | ' || coalesce(aka_first_name, '') || ' | ' || coalesce(case_number, '') || ' | ' || coalesce(legacy_file_number, '') || ' | ' || coalesce(din, '') || ' | ' || coalesce(hold_by, '') || ' | ' || coalesce(last_updated_by, '')
  ) STORED;

ALTER TABLE csa.contacts ALTER COLUMN search_text SET NOT NULL;

-- Recreate trigram index (dropped with the column)
CREATE INDEX idx_contacts_search_text_trgm ON csa.contacts USING GIN (search_text gin_trgm_ops);
