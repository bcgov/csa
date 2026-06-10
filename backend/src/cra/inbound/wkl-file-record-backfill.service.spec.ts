import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { WklFileRecordBackfillService } from './wkl-file-record-backfill.service'

const { WKL_MATCH_STATUS } = CRA_DATA_HANDLING_CONSTANT

const electronicDetail = {
  transactionType: 'C',
  receiveMode: 'E',
  childDin: '123456789',
  childGivenName: 'JOHN',
  childInitial: ' ',
  childSurName: 'DOE',
  childSex: 'M',
  childBirthDate: '20100315',
  childBirthCity: 'VANCOUVER',
  childBirthProv: 'BC',
  childBirthCountry: 'CA',
  careStartDate: '20250101',
  careEndDate: '20250601',
  careEndReasonCode: '21',
  status: 'completed',
  completionDate: '20250420',
}

describe('WklFileRecordBackfillService', () => {
  let service: WklFileRecordBackfillService
  let mockWeeklyContactMatcher: any

  beforeEach(() => {
    mockWeeklyContactMatcher = {
      matchBatchDetailFromCandidates: vi.fn().mockReturnValue(null),
      findMatchingContact: vi.fn().mockResolvedValue(null),
      findCraBatchDetailForContact: vi.fn().mockResolvedValue(null),
    }

    service = new WklFileRecordBackfillService(
      {} as any,
      {} as any,
      {} as any,
      mockWeeklyContactMatcher,
      { persistRecord: vi.fn().mockResolvedValue(undefined) } as any,
    )
  })

  it('classifies non-electronic records as na', async () => {
    const result = await (service as any).classifyDetail(
      { ...electronicDetail, receiveMode: ' ' },
      new Date('2025-04-20'),
      new Date('2025-04-21T12:00:00.000Z'),
      [],
    )

    expect(result).toEqual({ matchStatus: WKL_MATCH_STATUS.NA })
  })

  it('classifies snapshot-matched records as matched', async () => {
    mockWeeklyContactMatcher.matchBatchDetailFromCandidates.mockReturnValue({
      id: 600,
      contactId: 99,
    })

    const result = await (service as any).classifyDetail(
      electronicDetail,
      new Date('2025-04-20'),
      new Date('2025-04-21T12:00:00.000Z'),
      [{ id: 600 }],
    )

    expect(result).toEqual({
      matchStatus: WKL_MATCH_STATUS.MATCHED,
      contactId: 99,
      batchDetailId: 600,
      matchedBy: 'SYSTEM',
      processedAt: new Date('2025-04-21T12:00:00.000Z'),
    })
  })

  it('classifies unmatched records when no batch detail or contact is found', async () => {
    const result = await (service as any).classifyDetail(
      electronicDetail,
      new Date('2025-04-20'),
      new Date('2025-04-21T12:00:00.000Z'),
      [],
    )

    expect(result).toEqual({ matchStatus: WKL_MATCH_STATUS.UNMATCHED })
  })

  it('classifies CRA batch detail matches as matched', async () => {
    mockWeeklyContactMatcher.findMatchingContact.mockResolvedValue({ id: 99 })
    mockWeeklyContactMatcher.findCraBatchDetailForContact.mockResolvedValue({
      id: 700,
      contactId: 99,
    })

    const result = await (service as any).classifyDetail(
      electronicDetail,
      new Date('2025-04-20'),
      new Date('2025-04-21T12:00:00.000Z'),
      [],
    )

    expect(result).toEqual({
      matchStatus: WKL_MATCH_STATUS.MATCHED,
      contactId: 99,
      batchDetailId: 700,
      matchedBy: 'SYSTEM',
      processedAt: new Date('2025-04-21T12:00:00.000Z'),
    })
  })
})
