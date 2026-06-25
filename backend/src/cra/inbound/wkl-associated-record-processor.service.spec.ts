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
    createWklBatchForUnmatchedRecords: ReturnType<typeof vi.fn>
    createBatchDetailsForWklUnmatchedRecords: ReturnType<typeof vi.fn>
    updateBatchDetailStatus: ReturnType<typeof vi.fn>
  }
  let mockContactsService: { forceUpdateCsaStatus: ReturnType<typeof vi.fn> }
  let mockWeeklyContactMatcher: { buildWklMatchingSnapshot: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockBatchesService = {
      findInProgressBatchDetailForContact: vi.fn().mockResolvedValue(null),
      findOrCreateWklBatchForUnmatchedRecords: vi.fn().mockResolvedValue({ id: 700 }),
      createWklBatchForUnmatchedRecords: vi.fn().mockResolvedValue({ id: 701 }),
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

  it('reuses in-progress batch detail from any batch when preferExistingInProgressDetail is set', async () => {
    mockBatchesService.findInProgressBatchDetailForContact.mockResolvedValue({
      id: 50,
      contactId: 99,
      batchId: 35,
      transactionType: 'application',
    })
    const counters = { approved: 0, refused: 0, skipped: 0 }

    await service.processAssociatedRecord(
      detail as any,
      99,
      '1-99',
      {
        unmatchedWklBatchId: { value: null },
        processedBatchIds: new Set(),
        header: { processDate: '20260622' } as any,
        origin: 'test',
        preferExistingInProgressDetail: true,
        batchDate: new Date('2026-06-17T07:00:00.000Z'),
      },
      counters,
    )

    expect(mockBatchesService.findInProgressBatchDetailForContact).toHaveBeenCalledWith(99)
    expect(mockBatchesService.findOrCreateWklBatchForUnmatchedRecords).not.toHaveBeenCalled()
    expect(counters.approved).toBe(1)
  })

  it('finds or creates CRA batch by CSA processing date when batchDate is provided', async () => {
    const batchDate = new Date('2026-06-17T07:00:00.000Z')
    const counters = { approved: 0, refused: 0, skipped: 0 }

    await service.processAssociatedRecord(
      detail as any,
      99,
      '1-99',
      {
        unmatchedWklBatchId: { value: null },
        processedBatchIds: new Set(),
        header: { processDate: '20260616' } as any,
        origin: 'test',
        batchDate,
      },
      counters,
    )

    expect(mockBatchesService.findInProgressBatchDetailForContact).not.toHaveBeenCalled()
    expect(mockBatchesService.findOrCreateWklBatchForUnmatchedRecords).toHaveBeenCalledWith(
      batchDate,
    )
    expect(mockBatchesService.createWklBatchForUnmatchedRecords).not.toHaveBeenCalled()
    expect(counters.approved).toBe(1)
  })

  it('falls back to header-based batch creation when batchDate is omitted', async () => {
    const header = { processDate: '20260616' } as any
    const counters = { approved: 0, refused: 0, skipped: 0 }

    await service.processAssociatedRecord(
      detail as any,
      99,
      '1-99',
      {
        unmatchedWklBatchId: { value: null },
        processedBatchIds: new Set(),
        header,
        origin: 'test',
      },
      counters,
    )

    expect(mockBatchesService.createWklBatchForUnmatchedRecords).toHaveBeenCalledWith(header)
    expect(mockBatchesService.findOrCreateWklBatchForUnmatchedRecords).not.toHaveBeenCalled()
  })
})
