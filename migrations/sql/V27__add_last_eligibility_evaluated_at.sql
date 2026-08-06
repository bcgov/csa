-- Per-contact watermark for BL-14C: when eligibility last evaluated/upserted staging data.
-- Independent of csa_status_effective_date (status/ICM audit).
ALTER TABLE csa.contacts
  ADD COLUMN last_eligibility_evaluated_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN csa.contacts.last_eligibility_evaluated_at IS
  'When eligibility last successfully evaluated and upserted this contact. Used for BL-14C staging change detection.';

-- Approximate prior eligibility upserts from SYSTEM-owned master updates.
-- User-set rows are left NULL so the first post-deploy run applies any pending staging
-- data (e.g. hold → fetch → resume records with stale master fields).
UPDATE csa.contacts
SET last_eligibility_evaluated_at = last_updated_at
WHERE last_updated_by = 'SYSTEM'
  AND last_eligibility_evaluated_at IS NULL;
