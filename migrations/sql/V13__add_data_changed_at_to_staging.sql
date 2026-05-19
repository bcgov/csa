-- Add data_changed_at to ICM staging tables for real change detection.
-- Unlike ingested_at (TIMESTAMP, updates every upsert), data_changed_at
-- (TIMESTAMPTZ) only updates when meaningful field values actually change.
-- This prevents false "data changed" signals from our own CSA status sync-back.

ALTER TABLE csa.stg_icm_cases
ADD COLUMN IF NOT EXISTS data_changed_at TIMESTAMPTZ;

ALTER TABLE csa.stg_icm_placements
ADD COLUMN IF NOT EXISTS data_changed_at TIMESTAMPTZ;

ALTER TABLE csa.stg_icm_legal_authority
ADD COLUMN IF NOT EXISTS data_changed_at TIMESTAMPTZ;

ALTER TABLE csa.stg_icm_legal_authority_admin
ADD COLUMN IF NOT EXISTS data_changed_at TIMESTAMPTZ;

ALTER TABLE csa.stg_icm_agreement
ADD COLUMN IF NOT EXISTS data_changed_at TIMESTAMPTZ;

ALTER TABLE csa.stg_icm_orders
ADD COLUMN IF NOT EXISTS data_changed_at TIMESTAMPTZ;
