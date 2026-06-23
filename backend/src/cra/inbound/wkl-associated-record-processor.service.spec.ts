import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { WklAssociatedRecordProcessorService } from './wkl-associated-record-processor.service'

const { WEEKLY_FILE } = CRA_DATA_HANDLING_CONSTANT
const { STATUS: WKL_STATUS } = WEEKLY_FILE

const detail = {
  transactionType: 'A',
  status: WKL_STATUS.COMPLETED,
  childGivenName: 'Jane',
  childSurName: 'Doe',
  childInitial: '',
  childDin: '123456789',
  childSex: 'F',
  childBirthDate: '20200101',
  childBirthCity: 'Vancouver',
  childBirthProv: 'BC',
  childBirthCountry: 'CA',
  receiveMode: 'E',
}

describe('WklAssociatedRecordProcessorService', () => {
  let service: WklAssociatedRecordProcessorService
  let mockBatchesService: {
    findInProgressBatchDetailForContact: ReturnType<typeof vi.fn>
    findOrCreateWklBatchForUnmatchedRecords: ReturnType<typeof vi.fn>
    createBatchDetailsForWklUnmatchedRecords: ReturnType<typeof vi.fn>
    updateBatchDetailStatus: ReturnType<typeof vi.fn>
  }
  let mockContactsService: { forceUpdateCsaStatus: ReturnType<typeof vi.fn> }
  let mockWeeklyContactMatcher: { buildWklMatchingSnapshot: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockBatchesService = {
      findInProgressBatchDetailForContact: vi.fn().mockResolvedValue(null),
      findOrCreateWklBatchForUnmatchedRecords: vi.fn().mockResolvedValue({ id: 700 }),
      createBatchDetailsForWklUnmatchedRecords: vi.fn().mockResolvedValue({
        id: 800,
        contactId: 99,
        batchId: 700,
      }),
      updateBatchDetailStatus: vi.fn().mockResolvedValue(undefined),
    }
    mockContactsService = {
      forceUpdateCsaStatus: vi.fn().mockResolvedValue(undefined),
    }
    mockWeeklyContactMatcher = {
      buildWklMatchingSnapshot: vi.fn().mockReturnValue({ childGivenName: 'Jane' }),
    }

    service = new WklAssociatedRecordProcessorService(
      mockBatchesService as any,
      mockContactsService as any,
      mockWeeklyContactMatcher as any,
    )
  })

  it('passes batchDate when reusing in-progress batch details', async () => {
    const batchDate = new Date('2026-06-23T07:00:00.000Z')
    const counters = { approved: 0, refused: 0, skipped: 0 }

    await service.processAssociatedRecord(detail as any, 99, '1-99', {
      unmatchedWklBatchId: { value: null },
      processedBatchIds: new Set(),
      header: { processDate: '20260622' } as any,
      origin: 'test',
      preferExistingInProgressDetail: true,
      batchDate,
    }, counters)

    expect(mockBatchesService.findInProgressBatchDetailForContact).toHaveBeenCalledWith(99, batchDate)
  })

  it('creates batch for CSA processing date when no in-progress detail matches that date', async () => {
    const batchDate = new Date('2026-06-23T07:00:00.000Z')
    const counters = { approved: 0, refused: 0, skipped: 0 }

    await service.processAssociatedRecord(detail as any, 99, '1-99', {
      unmatchedWklBatchId: { value: null },
      processedBatchIds: new Set(),
      header: { processDate: '20260622' } as any,
      origin: 'test',
      preferExistingInProgressDetail: true,
      batchDate,
    }, counters)

    expect(mockBatchesService.findOrCreateWklBatchForUnmatchedRecords).toHaveBeenCalledWith(batchDate)
    expect(mockBatchesService.createBatchDetailsForWklUnmatchedRecords).toHaveBeenCalledWith(
      700,
      99,
      'application',
      WKL_STATUS.COMPLETED,
      '1-99',
      expect.any(Object),
    )
    expect(counters.approved).toBe(1)
  })
})
