import { describe, expect, it } from 'vitest'
import type { DetailRecord04 } from './inbound-weekly.interface'
import { buildWklUpdatePayloads } from './wkl-snapshot-data'

const makeDetail = (overrides: Partial<DetailRecord04> = {}): DetailRecord04 =>
  ({
    childDin: '123456789',
    careStartDate: '20250101',
    careEndDate: '20250601',
    careEndReasonCode: '14',
    ...overrides,
  }) as DetailRecord04

describe('buildWklUpdatePayloads', () => {
  describe('contact payload', () => {
    it('syncs only DIN, never cancellation/effective fields', () => {
      const { contactData } = buildWklUpdatePayloads(makeDetail(), 'cancellation')
      expect(contactData).toEqual({ din: '123456789' })
    })

    it('omits DIN when blank', () => {
      const { contactData } = buildWklUpdatePayloads(
        makeDetail({ childDin: '   ' }),
        'cancellation',
      )
      expect(contactData).toEqual({})
    })
  })

  describe('batch detail snapshot — cancellation', () => {
    it('snapshots care END date and reason from the WKL record', () => {
      const { batchDetailData } = buildWklUpdatePayloads(
        makeDetail({ careEndDate: '20250601', careEndReasonCode: '22' }),
        'cancellation',
      )
      expect(batchDetailData).toEqual({
        effectiveDate: expect.any(Date),
        cancelReasonCode: '22',
      })
    })

    it('does not fabricate defaults when WKL sends blank fields', () => {
      const { batchDetailData } = buildWklUpdatePayloads(
        makeDetail({
          careEndDate: '        ',
          careEndReasonCode: '  ' as DetailRecord04['careEndReasonCode'],
        }),
        'cancellation',
      )
      expect(batchDetailData).toEqual({})
    })
  })

  describe('batch detail snapshot — application', () => {
    it('snapshots the start date and omits cancellation reason', () => {
      const { batchDetailData } = buildWklUpdatePayloads(
        makeDetail({ careStartDate: '20250101', careEndReasonCode: '14' }),
        'application',
      )
      expect(batchDetailData).toEqual({ effectiveDate: expect.any(Date) })
      expect(batchDetailData).not.toHaveProperty('cancelReasonCode')
    })
  })
})
