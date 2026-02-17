import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PollCraResponseHandler } from './poll-cra-response.handler'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import {
  BATCH_DETAIL_EVENT,
  BATCH_DETAIL_STATUS,
  CSA_EVENT,
} from 'src/common/state-machine/constants'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { DETAIL_OUTCOME } from '../inbound/inbound.interface'

const DESTINATION_ID = CRA_DATA_HANDLING_CONSTANT.DESTINATION_ID
const { TRAN_STAT_CODE, FILE_STAT_CODE } = CRA_DATA_HANDLING_CONSTANT

const mockContext: JobContext = {
  jobRunId: 1,
  jobType: JobType.POLL_CRA_RESPONSE,
  jobTrigger: JobTrigger.CRON,
  retryCount: 0,
}

// Mock factory for CRA response details
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

// Valid response file name: {userId}.{envFlag}RSP{seq}.txt
// In test env NODE_ENV is 'test' (not 'production'), so expected env flag is 'V'
const VALID_FILE_NAME = 'craUserId.VRSP0001.txt'

describe('PollCraResponseHandler', () => {
  let handler: PollCraResponseHandler
  let mockInboundFileService: any
  let mockInboundResponseService: any
  let mockPrisma: any
  let mockBatchesService: any
  let mockContactsService: any

  beforeEach(() => {
    mockInboundFileService = {
      downloadNewResponseFiles: vi.fn().mockResolvedValue([]),
      getLocalFilePath: vi.fn().mockReturnValue('/tmp/cra-ftp/inbound/default.txt'),
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

        if (
          detail.tranStatCd === TRAN_STAT_CODE.TRAN_ACCEPTED ||
          detail.tranStatCd === TRAN_STAT_CODE.PROBLEM_DEDUCTED
        ) {
          return { outcome: DETAIL_OUTCOME.ACCEPTED, systemComments, din }
        }

        if (detail.tranStatCd === TRAN_STAT_CODE.TRAN_REJECTED) {
          return { outcome: DETAIL_OUTCOME.REJECTED, systemComments, din: null }
        }

        if (detail.tranStatCd === TRAN_STAT_CODE.TRAN_RECYCLED) {
          return { outcome: DETAIL_OUTCOME.RECYCLED, systemComments, din: null }
        }

        return { outcome: DETAIL_OUTCOME.REJECTED, systemComments, din: null }
      }),
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

    handler = new PollCraResponseHandler(
      mockInboundFileService,
      mockInboundResponseService,
      mockPrisma,
      mockBatchesService,
      mockContactsService,
    )
  })

  it('should have jobType POLL_CRA_RESPONSE', () => {
    expect(handler.jobType).toBe(JobType.POLL_CRA_RESPONSE)
  })

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Sets up an unprocessed file in the DB (simulates a previously downloaded file).
   * The handler queries transferFile.findMany for unprocessed files.
   */
  function setupUnprocessedFile(fileName: string, id = 1) {
    mockPrisma.transferFile.findMany.mockResolvedValue([
      { id, fileName, isDetailsProcessed: false, valid: true },
    ])
    mockInboundFileService.getLocalFilePath.mockReturnValue(`/tmp/cra-ftp/inbound/${fileName}`)
  }

  /**
   * Sets up parseFile to return the given details.
   */
  function setupParseFile(details: any[]) {
    mockInboundResponseService.parseFile.mockReturnValue({
      header: { recordCount: details.length + 2 },
      details,
    })
  }

  /**
   * Sets up a single batch detail lookup. Chain for multiple details.
   */
  function setupBatchDetail(detailId: number, contactId: number, batchId: number) {
    mockPrisma.contactBatchDetail.findUnique.mockResolvedValueOnce({
      id: detailId,
      contactId,
      batchId,
      transactionType: 'application',
      systemComments: null,
    })
  }

  // ─── No new files ─────────────────────────────────────────────────────────

  describe('No new files', () => {
    it('should return success with files_processed: 0 when no unprocessed files', async () => {
      // Default: transferFile.findMany returns [] (no unprocessed files)

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata.files_processed).toBe(0)
      expect(mockInboundResponseService.parseFile).not.toHaveBeenCalled()
    })

    it('should still call downloadNewResponseFiles to download new files', async () => {
      await handler.execute(mockContext)

      expect(mockInboundFileService.downloadNewResponseFiles).toHaveBeenCalledWith(DESTINATION_ID)
    })
  })

  // ─── Invalid file format ──────────────────────────────────────────────────

  describe('Invalid file format', () => {
    it('should return files_processed: 0 when no valid response file found', async () => {
      // downloadNewResponseFiles handles validation internally
      // No unprocessed files in DB (default mock returns [])

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata.files_processed).toBe(0)
      expect(mockInboundResponseService.parseFile).not.toHaveBeenCalled()
    })
  })

  // ─── File-level validation (fileStatCd) ─────────────────────────────────

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
        BATCH_DETAIL_EVENT.CRA_REJECTED,
        { additionalData: { systemComments: expect.any(String) } },
      )
      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        1,
        CSA_EVENT.CRA_REJECTED,
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

  // ─── Accepted transaction (tranStatCd='1') ──────────────────────────────────

  describe('Accepted transaction (tranStatCd=1)', () => {
    it('should call updateBatchDetailStatus with CRA_ACCEPTED', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        100,
        BATCH_DETAIL_EVENT.CRA_ACCEPTED,
        { additionalData: { systemComments: null } },
      )
    })

    it('should call updateCsaStatus with CRA_ACCEPTED', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        1,
        CSA_EVENT.CRA_ACCEPTED,
        'SYSTEM',
        { additionalData: {} },
      )
    })

    it('should set DIN on contact when ccraDinNum is provided and contact has no DIN', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED,
        ccraDinNum: '123456789',
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        1,
        CSA_EVENT.CRA_ACCEPTED,
        'SYSTEM',
        { additionalData: { din: '123456789' } },
      )
    })

    it('should NOT overwrite existing DIN on contact', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED,
        ccraDinNum: '123456789',
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: '999999999' })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        1,
        CSA_EVENT.CRA_ACCEPTED,
        'SYSTEM',
        { additionalData: {} },
      )
    })

    it('should call aggregateBatchStatus for the batch', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })

      await handler.execute(mockContext)

      expect(mockBatchesService.aggregateBatchStatus).toHaveBeenCalledWith(10)
    })

    it('should return metadata with records_accepted: 1', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_accepted).toBe(1)
      expect(result.metadata.records_rejected).toBe(0)
      expect(result.metadata.records_recycled).toBe(0)
    })
  })

  // ─── Rejected transaction (tranStatCd='2', not 998) ─────────────────────────

  describe('Rejected transaction (tranStatCd=2, not 998)', () => {
    it('should call updateBatchDetailStatus with CRA_REJECTED and systemComments', async () => {
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
        BATCH_DETAIL_EVENT.CRA_REJECTED,
        { additionalData: { systemComments: expect.any(String) } },
      )
    })

    it('should call updateCsaStatus with CRA_REJECTED', async () => {
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
        CSA_EVENT.CRA_REJECTED,
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

  // ─── Recycled (tranStatCd='3') ──────────────────────────────────────────────

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

  // ─── Problem deducted (tranStatCd='4') ──────────────────────────────────────

  describe('Problem deducted (tranStatCd=4)', () => {
    it('should treat as accepted and call updateBatchDetailStatus with CRA_ACCEPTED', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.PROBLEM_DEDUCTED,
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        100,
        BATCH_DETAIL_EVENT.CRA_ACCEPTED,
        { additionalData: { systemComments: null } },
      )
    })

    it('should treat as accepted and call updateCsaStatus with CRA_ACCEPTED', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.PROBLEM_DEDUCTED,
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        1,
        CSA_EVENT.CRA_ACCEPTED,
        'SYSTEM',
        { additionalData: {} },
      )
    })

    it('should increment records_accepted (not records_rejected)', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.PROBLEM_DEDUCTED,
      })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_accepted).toBe(1)
      expect(result.metadata.records_rejected).toBe(0)
    })
  })

  // ─── Unknown tranStatCd (fallthrough) ──────────────────────────────────────

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
        BATCH_DETAIL_EVENT.CRA_REJECTED,
        { additionalData: { systemComments: null } },
      )
      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        1,
        CSA_EVENT.CRA_REJECTED,
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

  // ─── Mixed batch results ──────────────────────────────────────────────────

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
        { status: BATCH_DETAIL_STATUS.PROCESSED },
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_accepted).toBe(1)
      expect(result.metadata.records_rejected).toBe(1)
      expect(result.metadata.records_updated).toBe(2)
    })
  })

  // ─── Mark file as processed ───────────────────────────────────────────────

  describe('Mark file as processed', () => {
    it('should mark TransferFile as processed after processing details', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockPrisma.transferFile.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          isDetailsProcessed: true,
          deliveredAt: expect.any(Date),
          referenceNumbers: [100],
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
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockPrisma.transferFile.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          referenceNumbers: [100, 200],
        }),
      })
    })
  })

  // ─── State reset on retry ─────────────────────────────────────────────────

  describe('State reset', () => {
    it('should reset counters at start of execute (handler reuse across retries)', async () => {
      // First execution: accepted detail
      const detail1 = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail1])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      const result1 = await handler.execute(mockContext)
      expect(result1.metadata.records_accepted).toBe(1)

      // Second execution: rejected detail (counters should reset)
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

      // Counters should reflect only the second execution, not accumulate
      expect(result2.metadata.records_accepted).toBe(0)
      expect(result2.metadata.records_rejected).toBe(1)
      expect(result2.metadata.records_recycled).toBe(0)
    })
  })

  // ─── Batch detail not found ───────────────────────────────────────────────

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

  // ─── File download and processing ─────────────────────────────────────────

  describe('File download and processing', () => {
    it('should call downloadNewResponseFiles with destination', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockInboundFileService.downloadNewResponseFiles).toHaveBeenCalledWith(DESTINATION_ID)
    })

    it('should call getLocalFilePath with destination and fileName', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupUnprocessedFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
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
        data: { valid: false, isDetailsProcessed: true },
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
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.files_processed).toBe(1)
    })
  })

  // ─── Batch with in_progress details remaining ─────────────────────────────

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
})
