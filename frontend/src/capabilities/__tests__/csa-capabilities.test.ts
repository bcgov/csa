import { describe, expect, it } from 'vitest'
import { getCsaCapabilities } from '../csa-capabilities'

describe('getCsaCapabilities', () => {
  it('grants standard CSA access', () => {
    const caps = getCsaCapabilities('CSA_STANDARD')

    expect(caps.userProfile).toBe('CSA_STANDARD')
    expect(caps.isStandardUser).toBe(true)
    expect(caps.isDataQualitySteward).toBe(false)
    expect(caps.canEditContactRecords).toBe(false)
  })

  it('restricts data quality stewards to eligibility edit/delete', () => {
    const caps = getCsaCapabilities('DATA_QUALITY_STEWARD')

    expect(caps.userProfile).toBe('DATA_QUALITY_STEWARD')
    expect(caps.isDataQualitySteward).toBe(true)
    expect(caps.isStandardUser).toBe(false)
    expect(caps.canEditContactRecords).toBe(true)
  })

  it('denies access when profile is unknown', () => {
    const caps = getCsaCapabilities(null)

    expect(caps.userProfile).toBeNull()
    expect(caps.isStandardUser).toBe(false)
    expect(caps.isDataQualitySteward).toBe(false)
    expect(caps.canEditContactRecords).toBe(false)
  })
})
