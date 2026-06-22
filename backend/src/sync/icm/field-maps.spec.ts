import { STG_ICM_CASES_MAP } from './field-maps'

/**
 * Master fields that IcmSyncBackService.toPayload writes back to ICM:
 *   'CSA Status'                 -> csa_status
 *   'CSA Status Effective Date'  -> csa_status_effective_date
 *   'CSA DIN'                    -> din
 *   'CSA Sent Date'              -> csa_sent_date
 *
 * Because the system writes these values into ICM, the next ingestion sees them
 * as "new" data. If they participate in change detection, data_changed_at gets
 * bumped after a user-set status change, which defeats the user-set preservation
 * in EligibilityService (BL-14B/14C). They MUST be excluded from change detection.
 */
const SYNC_BACK_MASTER_FIELDS = [
  'csa_status',
  'csa_status_effective_date',
  'din',
  'csa_sent_date',
] as const

describe('STG_ICM_CASES_MAP change detection', () => {
  it('excludes every sync-back-written field from change detection', () => {
    for (const masterField of SYNC_BACK_MASTER_FIELDS) {
      const entry = STG_ICM_CASES_MAP.find((e) => e.masterField === masterField)
      expect(entry, `expected a cases field map entry for ${masterField}`).toBeDefined()
      expect(
        entry!.excludeFromChangeDetection,
        `${entry!.sourceField} (${masterField}) is written back to ICM by sync-back and must be excludeFromChangeDetection, otherwise it bumps data_changed_at and overrides user-set status`,
      ).toBe(true)
    }
  })
})
