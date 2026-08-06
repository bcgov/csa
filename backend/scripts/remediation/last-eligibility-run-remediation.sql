-- ============================================================
-- Last Eligibility Run — Hold/Resume Stale Master Remediation
-- ============================================================
-- Ticket:      <ticket-number>
-- Date:        <yyyy-mm-dd>
-- Author:      <name>
-- Environment: <Pre-Prod | Prod>
--
-- Purpose:
--   After deploying last_eligibility_run_at (V27), migration seeds
--   last_eligibility_run_at from csa_status_effective_date so BL-14C
--   skip behaviour matches production. Records already broken by
--   hold → fetch → resume may still have a resume-time watermark
--   and stale master fields (e.g. birth_country).
--
--   This script:
--     1. Identifies suspect contacts (staging newer than watermark, master stale)
--     2. Clears last_eligibility_run_at so the next eligibility run applies staging
--     3. (Manual) Run eligibility on the cohort — batch or individual UI
--
--   Going forward, resume no longer advances last_eligibility_run_at; only
--   eligibility upserts do. New hold/resume cases are fixed by the code change.
--
-- DO NOT run Step 2 until Step 1 results are reviewed.
-- ============================================================


-- ============================================================
-- STEP 1: Identify suspect records (read-only)
--
-- Pattern: staging ICM case data changed after the per-contact
-- eligibility watermark, but master birth_country still differs
-- from staging (example field from the July 20 defect).
--
-- Adjust the field comparison or add case_number filter as needed.
-- Expected: review row count with ops / client before remediating.
-- ============================================================

SELECT
  c.id,
  c.person_id_icm,
  c.case_number,
  c.csa_status,
  c.last_updated_by,
  c.csa_status_effective_date,
  c.last_eligibility_run_at,
  c.birth_country          AS master_birth_country,
  cases.BIRTH_PLACE        AS staging_birth_country,
  cases.data_changed_at    AS staging_data_changed_at
FROM csa.contacts c
INNER JOIN csa.stg_icm_cases cases
  ON cases.X_CONTACT_NUM = c.person_id_icm
WHERE c.last_eligibility_run_at IS NOT NULL
  AND cases.data_changed_at > c.last_eligibility_run_at
  AND c.csa_status IS DISTINCT FROM 'on_hold'
  AND (
    c.birth_country IS DISTINCT FROM cases.BIRTH_PLACE
    OR (c.birth_country IS NULL AND cases.BIRTH_PLACE IS NOT NULL)
  )
ORDER BY c.case_number;


-- ============================================================
-- STEP 1b (optional): Narrow to a known client list
-- ============================================================

-- SELECT ...
-- WHERE c.case_number IN (
--   '1-12345678',
--   '1-67890123'
-- );


-- ============================================================
-- STEP 2: Clear watermark for suspect cohort (inside transaction)
--
-- Clears last_eligibility_run_at so eligibility will not skip BL-14C.
-- Then run RUN_ELIGIBILITY (batch) or Run Eligibility per record in UI.
-- ============================================================

-- BEGIN;
--
-- UPDATE csa.contacts c
-- SET last_eligibility_run_at = NULL
-- FROM csa.stg_icm_cases cases
-- WHERE cases.X_CONTACT_NUM = c.person_id_icm
--   AND c.last_eligibility_run_at IS NOT NULL
--   AND cases.data_changed_at > c.last_eligibility_run_at
--   AND c.csa_status IS DISTINCT FROM 'on_hold'
--   AND (
--     c.birth_country IS DISTINCT FROM cases.BIRTH_PLACE
--     OR (c.birth_country IS NULL AND cases.BIRTH_PLACE IS NOT NULL)
--   );
--
-- -- Verify row count matches Step 1 before COMMIT
-- COMMIT;


-- ============================================================
-- STEP 3: Post-check (after eligibility run)
-- ============================================================

-- SELECT
--   c.id,
--   c.case_number,
--   c.birth_country          AS master_birth_country,
--   cases.BIRTH_PLACE        AS staging_birth_country,
--   c.last_eligibility_run_at
-- FROM csa.contacts c
-- INNER JOIN csa.stg_icm_cases cases ON cases.X_CONTACT_NUM = c.person_id_icm
-- WHERE c.case_number IN ( ... remediated case numbers ... );
