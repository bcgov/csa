import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import { describe, expect, it } from 'vitest'
import {
  buildTransactionSourceWhere,
  resolveCsaMatchFoundStatuses,
} from './weekly-file-record-filters'

const { WKL_MATCH_STATUS } = CRA_DATA_HANDLING_CONSTANT

describe('weekly-file-record-filters', () => {
  it('maps CSA Match Found filter values to match_status groups', () => {
    expect(resolveCsaMatchFoundStatuses(['Yes'])).toEqual([WKL_MATCH_STATUS.MATCHED])
    expect(resolveCsaMatchFoundStatuses(['No'])).toEqual([
      WKL_MATCH_STATUS.UNMATCHED,
      WKL_MATCH_STATUS.ASSOCIATED,
    ])
    expect(resolveCsaMatchFoundStatuses(['Yes', 'No'])).toEqual([
      WKL_MATCH_STATUS.MATCHED,
      WKL_MATCH_STATUS.UNMATCHED,
      WKL_MATCH_STATUS.ASSOCIATED,
    ])
  })

  it('maps transaction source search terms to stored column predicates', () => {
    expect(buildTransactionSourceWhere('elec')).toEqual({
      OR: [{ transactionSource: 'E' }],
    })
    expect(buildTransactionSourceWhere('oth')).toEqual({
      OR: [{ OR: [{ transactionSource: '' }, { transactionSource: null }] }],
    })
    expect(buildTransactionSourceWhere('ab')).toBeNull()
  })
})
