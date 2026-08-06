-- Per-contact watermark for BL-14C: when eligibility last ran and upserted staging data.
-- Independent of csa_status_effective_date (status/ICM audit going forward).
ALTER TABLE csa.contacts
  ADD COLUMN last_eligibility_run_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN csa.contacts.last_eligibility_run_at IS
  'When eligibility last successfully ran and upserted this contact. Used for BL-14C staging change detection.';

-- Seed from existing CSA status effective date so BL-14C skip behaviour matches production
-- (previously used csa_status_effective_date as the freshness watermark).
-- Records with no effective date stay NULL (same as before: eligibility will not skip).
-- Hold/resume defect cohort may still have a resume-time watermark; remediate separately (see wiki).
UPDATE csa.contacts
SET last_eligibility_run_at = csa_status_effective_date
WHERE csa_status_effective_date IS NOT NULL
  AND last_eligibility_run_at IS NULL;
