import {
  BATCH_DETAIL_EVENT,
  BATCH_DETAIL_STATUS,
  CSA_EVENT,
} from 'src/common/state-machine/constants'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import type { ResponseFileType } from '../inbound/inbound-file.service'
import { DETAIL_OUTCOME } from '../inbound/inbound.interface'
import { PollCraResponseHandler } from './poll-cra-response.handler'
import { parseEffectiveDate } from 'src/common/utils'

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

const DESTINATION_ID = CRA_DATA_HANDLING_CONSTANT.DESTINATION_ID
const { TRAN_STAT_CODE, FILE_STAT_CODE, WEEKLY_FILE } = CRA_DATA_HANDLING_CONSTANT
const { STATUS: WKL_STATUS } = WEEKLY_FILE

const mockContext: JobContext = {
  jobRunId: 1,
  jobType: JobType.POLL_CRA_RESPONSE,
  jobTrigger: JobTrigger.CRON,
  retryCount: 0,
}

const makeDetail = (overrides = {}) => ({
  referenceNum: '100',
  tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED,
  fileStatCd: FILE_STAT_CODE.FILE_OK,
  tranType: 2,
  ccraDinNum: '',
  rejectCd1: '',
  rejectCd2: '',
  rejectCd3: '',
  rejectCd4: '',
  rejectCd5: '',
  ...overrides,
})

const VALID_FILE_NAME = 'craUserId.VRSP0001.txt'

describe('PollCraResponseHandler', () => {
  let handler: PollCraResponseHandler

  let mockCraTransferService: any
  let mockInboundFileService: any
  let mockInboundResponseService: any
  let mockInboundWeeklyResponseService: any
  let mockPrisma: any
  let mockBatchesService: any
  let mockContactsService: any
  let mockIcmSyncBackService: any
  let mockWeeklyContactMatcher: any

  beforeEach(() => {
    mockCraTransferService = {
      listInboundFiles: vi.fn().mockResolvedValue([]),
      downloadInboundFile: vi.fn(),
    }

    mockInboundFileService = {
      getLocalFilePath: vi.fn().mockReturnValue('/tmp/cra/inbound/default.txt'),
      isValidResponseFile: vi.fn().mockReturnValue(true),
      getResponseFileType: vi.fn().mockReturnValue('RSP' satisfies ResponseFileType),
    }

    mockInboundResponseService = {
      parseFile: vi.fn(),
      classifyDetail: vi.fn().mockImplementation((detail) => {
        if (detail.fileStatCd !== FILE_STAT_CODE.FILE_OK) {
          return { outcome: DETAIL_OUTCOME.FILE_ERROR, systemComments: 'File error', din: null }
        }

        const rejectCodes = ['rejectCd1', 'rejectCd2', 'rejectCd3', 'rejectCd4', 'rejectCd5']
          .map((k: string) => detail[k])
          .filter(Boolean)

        const systemComments = rejectCodes.length > 0 ? rejectCodes.join('; ') : null
        const din = detail.ccraDinNum?.trim() || null

        if (detail.tranStatCd === TRAN_STAT_CODE.TRAN_ACCEPTED) {
          return { outcome: DETAIL_OUTCOME.ACCEPTED, systemComments, din }
        }

        if (detail.tranStatCd === TRAN_STAT_CODE.TRAN_RECYCLED) {
          return { outcome: DETAIL_OUTCOME.RECYCLED, systemComments, din: null }
        }

        return { outcome: DETAIL_OUTCOME.REJECTED, systemComments, din: null }
      }),
    }

    mockInboundWeeklyResponseService = {
      parseWeeklyResponseFile: vi.fn(),
    }

    mockPrisma = {
      transferFile: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
      contactBatchDetail: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      contact: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      batch: {
        findUnique: vi.fn().mockResolvedValue({ systemComments: null }),
      },
    }

    mockBatchesService = {
      updateBatchStatus: vi.fn().mockResolvedValue({ success: true }),
      updateBatchDetailStatus: vi.fn().mockResolvedValue({ success: true }),
      aggregateBatchStatus: vi.fn().mockResolvedValue(undefined),
    }

    mockContactsService = {
      updateCsaStatus: vi.fn().mockResolvedValue({ success: true }),
    }

    mockIcmSyncBackService = {
      syncFlaggedWithRetry: vi.fn().mockResolvedValue({
        totalFlagged: 0,
        synced: 0,
        failed: 0,
        chunks: 0,
      }),
    }

    mockWeeklyContactMatcher = {
      loadCandidates: vi.fn().mockResolvedValue(undefined),
      findMatchingBatchDetail: vi.fn(),
      findMatchingContact: vi.fn(),
    }

    handler = new PollCraResponseHandler(
      mockCraTransferService,
      mockInboundFileService,
      mockInboundResponseService,
      mockInboundWeeklyResponseService,
      mockPrisma,
      mockBatchesService,
      mockContactsService,
      mockIcmSyncBackService as any,
      mockWeeklyContactMatcher,
    )
  })

  it('should have jobType POLL_CRA_RESPONSE', () => {
    expect(handler.jobType).toBe(JobType.POLL_CRA_RESPONSE)
  })

  function setupUnprocessedFile(fileName: string, id = 1) {
    mockPrisma.transferFile.findMany.mockResolvedValue([
      { id, fileName, isDetailsProcessed: false, isValid: true },
    ])
    mockInboundFileService.getLocalFilePath.mockReturnValue(`/tmp/cra/inbound/${fileName}`)
  }

  function setupParseFile(details: any[]) {
    mockInboundResponseService.parseFile.mockReturnValue({
      header: { recordCount: details.length + 2 },
      details,
    })
  }

  function setupBatchDetail(detailId: number, contactId: number, batchId: number) {
    mockPrisma.contactBatchDetail.findUnique.mockResolvedValueOnce({
      id: detailId,
      contactId,
      batchId,
      transactionType: 'application',
      systemComments: null,
    })
  }

  describe('No new files', () => {
    it('should return success with files_processed: 0 when no unprocessed files', async () => {
      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata.files_processed).toBe(0)
      expect(mockInboundResponseService.parseFile).not.toHaveBeenCalled()
    })

    it('should still call listInboundFiles to check for new files', async () => {
      await handler.execute(mockContext)

      expect(mockCraTransferService.listInboundFiles).toHaveBeenCalled()
    })
  })

  describe('Invalid file format', () => {
    it('should return files_processed: 0 when no valid response file found', async () => {
      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata.files_processed).toBe(0)
      expect(mockInboundResponseService.parseFile).not.toHaveBeenCalled()
    })
  })

  describe('File-level validation (fileStatCd)', () => {
    it('should reject detail when fileStatCd is not FILE_OK', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        fileStatCd: FILE_STAT_CODE.INVALID_RECORD_COUNT,
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        100,
        BATCH_DETAIL_EVENT.CRA_FILE_REJECTED,
        { additionalData: { systemComments: expect.any(String) } },
      )
      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        1,
        CSA_EVENT.CRA_FILE_REJECTED,
        'SYSTEM',
      )
    })

    it('should count file-level rejection in records_rejected', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        fileStatCd: FILE_STAT_CODE.INVALID_EMPTY_FILE,
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_rejected).toBe(1)
      expect(result.metadata.records_accepted).toBe(0)
    })
  })

  describe('Accepted transaction (tranStatCd=1)', () => {
    it('should NOT call updateBatchDetailStatus for accepted records', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).not.toHaveBeenCalled()
    })

    it('should NOT call updateCsaStatus for accepted records', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      await handler.execute(mockContext)

      expect(mockContactsService.updateCsaStatus).not.toHaveBeenCalled()
    })

    it('should make no contactBatchDetail update when record is accepted', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)

      await handler.execute(mockContext)

      expect(mockPrisma.contactBatchDetail.update).not.toHaveBeenCalled()
    })

    it('should call aggregateBatchStatus for the batch', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)

      await handler.execute(mockContext)

      expect(mockBatchesService.aggregateBatchStatus).toHaveBeenCalledWith(10)
    })

    it('should return metadata with records_accepted: 1', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_accepted).toBe(1)
      expect(result.metadata.records_rejected).toBe(0)
      expect(result.metadata.records_recycled).toBe(0)
    })
  })

  describe('Rejected transaction (tranStatCd=2, not 998)', () => {
    it('should call updateBatchDetailStatus with CRA_RSP_REJECTED and systemComments', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '007',
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        100,
        BATCH_DETAIL_EVENT.CRA_RSP_REJECTED,
        { additionalData: { systemComments: expect.any(String) } },
      )
    })

    it('should call updateCsaStatus with CRA_RSP_REJECTED', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '007',
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      await handler.execute(mockContext)

      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        1,
        CSA_EVENT.CRA_RSP_REJECTED,
        'SYSTEM',
      )
    })

    it('should call aggregateBatchStatus for the batch', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '007',
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)

      await handler.execute(mockContext)

      expect(mockBatchesService.aggregateBatchStatus).toHaveBeenCalledWith(10)
    })

    it('should return metadata with records_rejected: 1', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '007',
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_rejected).toBe(1)
      expect(result.metadata.records_accepted).toBe(0)
      expect(result.metadata.records_recycled).toBe(0)
    })
  })

  describe('Recycled (tranStatCd=3)', () => {
    it('should NOT call updateBatchDetailStatus', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_RECYCLED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).not.toHaveBeenCalled()
    })

    it('should NOT call updateCsaStatus', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_RECYCLED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      await handler.execute(mockContext)

      expect(mockContactsService.updateCsaStatus).not.toHaveBeenCalled()
    })

    it('should update systemComments directly via prisma', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_RECYCLED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      await handler.execute(mockContext)

      expect(mockPrisma.contactBatchDetail.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { systemComments: null, lastUpdatedBy: 'SYSTEM' },
      })
    })

    it('should return metadata with records_recycled: 1', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_RECYCLED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_recycled).toBe(1)
    })
  })

  describe('Problem detected (tranStatCd=4)', () => {
    it('should treat as rejected and call updateBatchDetailStatus with CRA_RSP_REJECTED', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.PROBLEM_DETECTED,
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        100,
        BATCH_DETAIL_EVENT.CRA_RSP_REJECTED,
        { additionalData: { systemComments: null } },
      )
    })

    it('should treat as rejected and call updateCsaStatus with CRA_RSP_REJECTED', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.PROBLEM_DETECTED,
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      await handler.execute(mockContext)

      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        1,
        CSA_EVENT.CRA_RSP_REJECTED,
        'SYSTEM',
      )
    })

    it('should increment records_rejected (not records_accepted)', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.PROBLEM_DETECTED,
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_rejected).toBe(1)
      expect(result.metadata.records_accepted).toBe(0)
    })
  })

  describe('Unknown tranStatCd (fallthrough)', () => {
    it('should treat unknown tranStatCd as rejected', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_NOT_SET })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        100,
        BATCH_DETAIL_EVENT.CRA_RSP_REJECTED,
        { additionalData: { systemComments: null } },
      )
      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        1,
        CSA_EVENT.CRA_RSP_REJECTED,
        'SYSTEM',
      )
    })

    it('should count unknown tranStatCd in records_rejected', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_NOT_SET })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_rejected).toBe(1)
    })
  })

  describe('Mixed batch results', () => {
    it('should call aggregateBatchStatus for the batch after processing mixed details', async () => {
      const acceptedDetail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED,
      })
      const rejectedDetail = makeDetail({
        referenceNum: '101',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '007',
      })

      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([acceptedDetail, rejectedDetail])

      setupBatchDetail(100, 1, 10)
      setupBatchDetail(101, 2, 10)

      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })

      await handler.execute(mockContext)

      expect(mockBatchesService.aggregateBatchStatus).toHaveBeenCalledWith(10)
    })

    it('should count both accepted and rejected records in metadata', async () => {
      const acceptedDetail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED,
      })
      const rejectedDetail = makeDetail({
        referenceNum: '101',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '007',
      })

      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([acceptedDetail, rejectedDetail])
      setupBatchDetail(100, 1, 10)
      setupBatchDetail(101, 2, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_accepted).toBe(1)
      expect(result.metadata.records_rejected).toBe(1)
      expect(result.metadata.records_updated).toBe(2)
    })
  })

  describe('ICM sync-back trigger', () => {
    it('should call syncFlaggedWithRetry after processing', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })

      await handler.execute(mockContext)

      expect(mockIcmSyncBackService.syncFlaggedWithRetry).toHaveBeenCalled()
    })

    it('should succeed even if sync-back throws', async () => {
      mockIcmSyncBackService.syncFlaggedWithRetry.mockRejectedValue(new Error('ICM API down'))
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
    })

    it('should include syncResult in metadata', async () => {
      mockIcmSyncBackService.syncFlaggedWithRetry.mockResolvedValue({
        totalFlagged: 5,
        synced: 5,
        failed: 0,
        chunks: 1,
      })
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })

      const result = await handler.execute(mockContext)

      expect(result.metadata.syncResult).toEqual({
        totalFlagged: 5,
        synced: 5,
        failed: 0,
        chunks: 1,
      })
    })
  })

  describe('Mark file as processed', () => {
    it('should mark TransferFile as processed after processing details', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
      ])

      await handler.execute(mockContext)

      expect(mockPrisma.transferFile.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          isDetailsProcessed: true,
          deliveredAt: expect.any(Date),
          referenceNumbers: ['100'],
        },
      })
    })

    it('should include all referenceNumbers from details', async () => {
      const detail1 = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      const detail2 = makeDetail({ referenceNum: '200', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })

      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail1, detail2])
      setupBatchDetail(100, 1, 10)
      setupBatchDetail(200, 2, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
      ])

      await handler.execute(mockContext)

      expect(mockPrisma.transferFile.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          referenceNumbers: ['100', '200'],
        }),
      })
    })
  })

  describe('State reset', () => {
    it('should reset counters at start of execute (handler reuse across retries)', async () => {
      // First execution: accepted detail
      const detail1 = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail1])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
      ])

      const result1 = await handler.execute(mockContext)
      expect(result1.metadata.records_accepted).toBe(1)

      const detail2 = makeDetail({
        referenceNum: '200',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '007',
      })
      setupUnprocessedFile('craUserId.VRSP0002.txt', 2)
      setupParseFile([detail2])
      setupBatchDetail(200, 2, 20)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      const result2 = await handler.execute(mockContext)

      expect(result2.metadata.records_accepted).toBe(0)
      expect(result2.metadata.records_rejected).toBe(1)
      expect(result2.metadata.records_recycled).toBe(0)
    })
  })

  describe('Batch detail not found', () => {
    it('should skip detail when batch detail is not found in DB', async () => {
      const detail = makeDetail({ referenceNum: '999', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      mockPrisma.contactBatchDetail.findUnique.mockResolvedValue(null)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([])

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(mockBatchesService.updateBatchDetailStatus).not.toHaveBeenCalled()
      expect(mockContactsService.updateCsaStatus).not.toHaveBeenCalled()
    })
  })

  describe('File download and processing', () => {
    it('should call listInboundFiles to check for new files', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
      ])

      await handler.execute(mockContext)

      expect(mockCraTransferService.listInboundFiles).toHaveBeenCalled()
    })

    it('should call getLocalFilePath with destination and fileName', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
      ])

      await handler.execute(mockContext)

      expect(mockInboundFileService.getLocalFilePath).toHaveBeenCalledWith(
        DESTINATION_ID,
        VALID_FILE_NAME,
      )
    })

    it('should mark file as processed and continue when parseFile throws', async () => {
      setupUnprocessedFile(VALID_FILE_NAME)
      mockInboundResponseService.parseFile.mockImplementation(() => {
        throw new Error('Unrecognized CRA response file format')
      })

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata.files_processed).toBe(1)
      expect(result.metadata.records_updated).toBe(0)
      expect(mockPrisma.transferFile.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isValid: false, isDetailsProcessed: true },
      })
      expect(mockBatchesService.updateBatchDetailStatus).not.toHaveBeenCalled()
    })

    it('should return files_processed: 1 on success', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.files_processed).toBe(1)
    })
  })

  describe('Batch system comments', () => {
    it('should delegate batch comments to aggregateBatchStatus, not set them directly', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })

      await handler.execute(mockContext)

      expect(mockBatchesService.aggregateBatchStatus).toHaveBeenCalledWith(10)
    })
  })

  describe('Batch with in_progress details remaining', () => {
    it('should call aggregateBatchStatus for the batch', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })

      await handler.execute(mockContext)

      expect(mockBatchesService.aggregateBatchStatus).toHaveBeenCalledWith(10)
    })
  })

  describe('Weekly response file (WKL)', () => {
    const WEEKLY_FILE_NAME = 'craUserId.AWKL0001.txt'

    function setupWeeklyFile(fileName = WEEKLY_FILE_NAME, id = 1) {
      mockInboundFileService.getResponseFileType.mockReturnValue('WKL' satisfies ResponseFileType)
      setupUnprocessedFile(fileName, id)
    }

    const makeWklDetail = (overrides = {}) => ({
      tranCode: '6137',
      recordTypeCode: '04',
      transactionType: 'A' as const,
      receiveMode: 'E',
      childDin: '123456789',
      childGivenName: 'JOHN                          ',
      childInitial: ' ',
      childSurName: 'DOE                           ',
      childSex: 'M',
      childBirthDate: '20100315',
      childBirthCity: 'VANCOUVER                   ',
      childBirthProv: 'BC',
      childBirthCountry: 'CA',
      careStartDate: '20250101',
      careEndDate: '        ',
      careEndReasonCode: '  ',
      status: WKL_STATUS.COMPLETED,
      completionDate: '20250420',
      ...overrides,
    })

    function setupWeeklyParseFile(details: any[]) {
      mockInboundWeeklyResponseService.parseWeeklyResponseFile.mockReturnValue({
        header: { tranCode: '6136', recordTypeCode: '00' },
        details,
        trailer: { tranCode: '6138', recordTypeCode: '00', recordCount: details.length + 2 },
      })
    }

    const mockMatchedDetail = {
      id: 200,
      contactId: 42,
      batchId: 10,
      transactionType: 'application',
      systemComments: null,
      contact: { din: null },
    }

    it('routes WKL filenames to InboundWeeklyResponseService and does not call the RSP parser', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail(), makeWklDetail()])

      await handler.execute(mockContext)

      expect(mockInboundWeeklyResponseService.parseWeeklyResponseFile).toHaveBeenCalledWith(
        `/tmp/cra/inbound/${WEEKLY_FILE_NAME}`,
      )
      expect(mockInboundResponseService.parseFile).not.toHaveBeenCalled()
    })

    it('does not drive any RSP-branch side effects for weekly details', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail(), makeWklDetail(), makeWklDetail()])

      await handler.execute(mockContext)

      expect(mockInboundResponseService.classifyDetail).not.toHaveBeenCalled()
      expect(mockPrisma.contactBatchDetail.findUnique).not.toHaveBeenCalled()
    })

    it('persists isDetailsProcessed=true and referenceNumbers=[] for the weekly file', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail(), makeWklDetail()])

      await handler.execute(mockContext)

      expect(mockPrisma.transferFile.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          isDetailsProcessed: true,
          deliveredAt: expect.any(Date),
          referenceNumbers: [],
        },
      })
    })

    it('does not increment accept/reject/recycle counters for weekly files', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail(), makeWklDetail(), makeWklDetail(), makeWklDetail()])
      mockWeeklyContactMatcher.findMatchingBatchDetail.mockResolvedValue(mockMatchedDetail)

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_accepted).toBe(0)
      expect(result.metadata.records_rejected).toBe(0)
      expect(result.metadata.records_recycled).toBe(0)
      expect(result.metadata.files_processed).toBe(1)
    })

    it('marks the transfer file invalid when weekly parsing throws', async () => {
      setupWeeklyFile()
      mockInboundWeeklyResponseService.parseWeeklyResponseFile.mockImplementation(() => {
        throw new Error('corrupted weekly file')
      })

      await handler.execute(mockContext)

      expect(mockPrisma.transferFile.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isValid: false, isDetailsProcessed: true },
      })
      expect(mockInboundResponseService.parseFile).not.toHaveBeenCalled()
    })

    it('applies CRA_WKL_APPROVED for completed records', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail({ status: WKL_STATUS.COMPLETED })])
      mockWeeklyContactMatcher.findMatchingBatchDetail.mockResolvedValue(mockMatchedDetail)

      const result = await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        200,
        BATCH_DETAIL_EVENT.CRA_WKL_APPROVED,
      )
      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        42,
        CSA_EVENT.CRA_WKL_APPROVED,
        'SYSTEM',
        expect.objectContaining({ additionalData: expect.anything() }),
      )
      expect(result.metadata.records_wkl_approved).toBe(1)
      expect(result.metadata.records_wkl_refused).toBe(0)
    })

    it('applies CRA_WKL_APPROVED for updated records', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail({ status: WKL_STATUS.UPDATED })])
      mockWeeklyContactMatcher.findMatchingBatchDetail.mockResolvedValue(mockMatchedDetail)

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        200,
        BATCH_DETAIL_EVENT.CRA_WKL_APPROVED,
      )
      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        42,
        CSA_EVENT.CRA_WKL_APPROVED,
        'SYSTEM',
        expect.objectContaining({ additionalData: expect.anything() }),
      )
    })

    it('applies CRA_WKL_REFUSED for abandoned records', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail({ status: WKL_STATUS.ABANDONED })])
      mockWeeklyContactMatcher.findMatchingBatchDetail.mockResolvedValue(mockMatchedDetail)

      const result = await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        200,
        BATCH_DETAIL_EVENT.CRA_WKL_REFUSED,
      )
      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        42,
        CSA_EVENT.CRA_WKL_REFUSED,
        'SYSTEM',
        expect.objectContaining({ additionalData: expect.anything() }),
      )
      expect(result.metadata.records_wkl_refused).toBe(1)
      expect(result.metadata.records_wkl_approved).toBe(0)
    })

    it('skips in-progress records without making any service calls', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail({ status: WKL_STATUS.IN_PROGRESS })])

      const result = await handler.execute(mockContext)

      expect(mockWeeklyContactMatcher.findMatchingBatchDetail).not.toHaveBeenCalled()
      expect(mockBatchesService.updateBatchDetailStatus).not.toHaveBeenCalled()
      expect(mockContactsService.updateCsaStatus).not.toHaveBeenCalled()
      expect(result.metadata.records_wkl_skipped).toBe(1)
    })

    it('skips records with unexpected status', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail({ status: 'some-unknown-value' })])
      mockWeeklyContactMatcher.findMatchingBatchDetail.mockResolvedValue(mockMatchedDetail)

      const result = await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).not.toHaveBeenCalled()
      expect(mockContactsService.updateCsaStatus).not.toHaveBeenCalled()
      expect(result.metadata.records_wkl_skipped).toBe(1)
    })

    it('skips when no matching batch detail is found', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail()])
      mockWeeklyContactMatcher.findMatchingBatchDetail.mockResolvedValue(null)

      const result = await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).not.toHaveBeenCalled()
      expect(result.metadata.records_wkl_skipped).toBe(1)
    })

    it('passes DIN as additionalData when contact.din is blank', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail({ childDin: '987654321' })])
      mockWeeklyContactMatcher.findMatchingBatchDetail.mockResolvedValue({
        ...mockMatchedDetail,
        contact: { din: null },
      })

      await handler.execute(mockContext)

      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        42,
        CSA_EVENT.CRA_WKL_APPROVED,
        'SYSTEM',
        { additionalData: { din: '987654321', effectiveDate: parseEffectiveDate(new Date()) } },
      )
    })

    it('always updates DIN from WKL even when contact already has one', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail({ childDin: '987654321' })])
      mockWeeklyContactMatcher.findMatchingBatchDetail.mockResolvedValue({
        ...mockMatchedDetail,
        contact: { din: 'EXISTING123' },
      })

      await handler.execute(mockContext)

      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        42,
        CSA_EVENT.CRA_WKL_APPROVED,
        'SYSTEM',
        { additionalData: { din: '987654321', effectiveDate: parseEffectiveDate(new Date()) } },
      )
    })

    it('logs warning on transaction type mismatch but still processes', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail({ transactionType: 'C' as const })])
      mockWeeklyContactMatcher.findMatchingBatchDetail.mockResolvedValue({
        ...mockMatchedDetail,
        transactionType: 'application',
      })

      const result = await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        200,
        BATCH_DETAIL_EVENT.CRA_WKL_APPROVED,
      )
      expect(result.metadata.records_wkl_approved).toBe(1)
    })

    it('calls aggregateBatchStatus for batches affected by WKL processing', async () => {
      setupWeeklyFile()
      setupWeeklyParseFile([makeWklDetail()])
      mockWeeklyContactMatcher.findMatchingBatchDetail.mockResolvedValue(mockMatchedDetail)

      await handler.execute(mockContext)

      expect(mockBatchesService.aggregateBatchStatus).toHaveBeenCalledWith(10)
    })
  })
})
