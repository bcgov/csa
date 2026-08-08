import { describe, expect, it } from 'vitest'
import { getCsaCapabilities } from '../csa-capabilities'

describe('getCsaCapabilities', () => {
  it('grants standard CSA access', () => {
    const caps = getCsaCapabilities('CSA_STANDARD')

    expect(caps.userProfile).toBe('CSA_STANDARD')
    expect(caps.isStandardUser).toBe(true)
    expect(caps.isDataQualitySteward).toBe(false)
    expect(caps.canAccessEligibilityList).toBe(true)
    expect(caps.canEditContactRecords).toBe(false)
    expect(caps.canAccessBatches).toBe(true)
    expect(caps.canAccessWeeklyFiles).toBe(true)
    expect(caps.canAccessJobMonitoring).toBe(true)
    expect(caps.canPerformCsaActions).toBe(true)
    expect(caps.canViewContactBatchHistory).toBe(true)
    expect(caps.canViewJobRunSummary).toBe(true)
    expect(caps.canMonitorBackgroundJobs).toBe(true)
  })

  it('restricts data quality stewards to eligibility edit/delete', () => {
    const caps = getCsaCapabilities('DATA_QUALITY_STEWARD')

    expect(caps.userProfile).toBe('DATA_QUALITY_STEWARD')
    expect(caps.isDataQualitySteward).toBe(true)
    expect(caps.isStandardUser).toBe(false)
    expect(caps.canAccessEligibilityList).toBe(true)
    expect(caps.canEditContactRecords).toBe(true)
    expect(caps.canAccessBatches).toBe(false)
    expect(caps.canAccessWeeklyFiles).toBe(false)
    expect(caps.canAccessJobMonitoring).toBe(false)
    expect(caps.canPerformCsaActions).toBe(false)
    expect(caps.canViewContactBatchHistory).toBe(false)
    expect(caps.canViewJobRunSummary).toBe(false)
    expect(caps.canMonitorBackgroundJobs).toBe(false)
  })

  it('denies access when profile is unknown', () => {
    const caps = getCsaCapabilities(null)

    expect(caps.userProfile).toBeNull()
    expect(caps.isStandardUser).toBe(false)
    expect(caps.isDataQualitySteward).toBe(false)
    expect(caps.canAccessEligibilityList).toBe(false)
    expect(caps.canEditContactRecords).toBe(false)
    expect(caps.canMonitorBackgroundJobs).toBe(false)
  })
})
