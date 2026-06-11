import { describe, it, expect } from 'vitest'
import { buildFindIcmCsaDriftSql } from './icm-inbound-csa-sync.queries'

describe('buildFindIcmCsaDriftSql', () => {
  it('should match on case_number and exclude outbound-flagged contacts', () => {
    const sql = buildFindIcmCsaDriftSql()

    expect(sql).toContain('c.case_number = rc.CASE_NUM')
    expect(sql).toContain('c.icm_integration_status = false')
    expect(sql).toContain('cases.ingested_at >= $1::timestamptz')
    expect(sql).toContain("WHEN 'IN PAY' THEN 'in_pay'")
    expect(sql).toContain('rc.X_CONTACT_NUM IS DISTINCT FROM c.person_id_icm')
    expect(sql).not.toContain('rc.icm_din IS NOT NULL')
    expect(sql).toContain('rc.icm_din IS DISTINCT FROM NULLIF(TRIM(c.din), \'\')')
  })
})
