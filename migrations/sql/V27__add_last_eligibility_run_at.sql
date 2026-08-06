-- Per-contact watermark: when eligibility last ran and upserted staging data.
-- Independent of csa_status_effective_date (status/ICM audit going forward).
ALTER TABLE csa.contacts
  ADD COLUMN last_eligibility_run_at TIMESTAMPTZ NULL;
