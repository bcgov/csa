/** ICM fixture timestamps (MM/DD/YYYY HH:MM:SS). */
export const BASELINE_ICM_TIMESTAMP = '02/01/2026 10:00:00'
export const INCREMENTAL_ICM_TIMESTAMP = '08/08/2026 10:00:00'

/** MIS CSV timestamps (YYYY-MM-DD HH:MM:SS). */
export const BASELINE_MIS_TIMESTAMP = '2026-02-01 14:30:00'
export const INCREMENTAL_MIS_TIMESTAMP = '2026-08-08 14:30:00'

/** Simulated last successful ingest + eligibility before incremental fixtures arrive. */
export const BASELINE_JOB_COMPLETED_AT = new Date('2026-02-10T20:00:00.000Z')

export const BASELINE_CASE_COUNT = 32
export const INCREMENTAL_CASE_COUNT = 10
export const FULL_CASE_COUNT = BASELINE_CASE_COUNT + INCREMENTAL_CASE_COUNT
