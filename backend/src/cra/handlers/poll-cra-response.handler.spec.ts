import { describe, it, expect, vi, beforeEach } from 'vitest'
import { of } from 'rxjs'
import fs from 'fs'
import * as fsPromises from 'fs/promises'
import { PollCraResponseHandler } from './poll-cra-response.handler'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import {
  BATCH_DETAIL_EVENT,
  BATCH_DETAIL_STATUS,
  BATCH_EVENT,
  CSA_EVENT,
} from 'src/common/state-machine/constants'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'

vi.mock('fs')
vi.mock('fs/promises')

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
  let mockInboundResponseService: any
  let mockPrisma: any
  let mockHttpService: any
  let mockConfigService: any
  let mockBatchesService: any
  let mockContactsService: any

  beforeEach(() => {
    mockInboundResponseService = {
      parseFile: vi.fn(),
    }

    mockPrisma = {
      transferFile: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 1 }),
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

    mockHttpService = {
      get: vi.fn(),
    }

    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'app.fileStoragePath') return '/tmp'
        if (key === 'app.fileTransferServiceUrl') return 'http://file-transfer'
      }),
    }

    mockBatchesService = {
      updateBatchStatus: vi.fn().mockResolvedValue({ success: true }),
      updateBatchDetailStatus: vi.fn().mockResolvedValue({ success: true }),
    }

    mockContactsService = {
      updateCsaStatus: vi.fn().mockResolvedValue({ success: true }),
    }

    // Default fs mocks
    ;(fs.statSync as any).mockReturnValue({ size: 100 })
    ;(fs.existsSync as any).mockReturnValue(true)
    ;(fsPromises.writeFile as any).mockResolvedValue(undefined)

    handler = new PollCraResponseHandler(
      mockInboundResponseService,
      mockPrisma,
      mockHttpService,
      mockConfigService,
      mockBatchesService,
      mockContactsService,
    )
  })

  it('should have jobType POLL_CRA_RESPONSE', () => {
    expect(handler.jobType).toBe(JobType.POLL_CRA_RESPONSE)
  })

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Sets up httpService.get to return a list of remote files and then a download response.
   */
  function setupHttpForFile(fileName: string) {
    mockHttpService.get
      .mockReturnValueOnce(of({ data: { files: [{ fileName }] } }))
      .mockReturnValueOnce(of({ data: Buffer.from('dummy-file-content') }))
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
    it('should return success with files_processed: 0 when no remote files exist', async () => {
      mockHttpService.get.mockReturnValueOnce(of({ data: { files: [] } }))

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata.files_processed).toBe(0)
      expect(mockInboundResponseService.parseFile).not.toHaveBeenCalled()
    })

    it('should return success with files_processed: 0 when all remote files are already in DB', async () => {
      mockPrisma.transferFile.findMany.mockResolvedValue([{ fileName: VALID_FILE_NAME }])

      mockHttpService.get.mockReturnValueOnce(
        of({ data: { files: [{ fileName: VALID_FILE_NAME }] } }),
      )

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata.files_processed).toBe(0)
      expect(mockInboundResponseService.parseFile).not.toHaveBeenCalled()
    })
  })

  // ─── Invalid file format ──────────────────────────────────────────────────

  describe('Invalid file format', () => {
    it('should skip file with wrong env flag (P instead of V in test)', async () => {
      setupHttpForFile('craUserId.PRSP0001.txt')

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata.files_processed).toBe(0)
      expect(mockInboundResponseService.parseFile).not.toHaveBeenCalled()
    })

    it('should skip file with wrong type flag (WKL instead of RSP)', async () => {
      setupHttpForFile('craUserId.VWKL0001.txt')

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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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

    it('should aggregate batch with CRA_ACCEPTED when all details are processed', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchStatus).toHaveBeenCalledWith(
        10,
        BATCH_EVENT.CRA_ACCEPTED,
        { additionalData: {} },
      )
    })

    it('should return metadata with records_accepted: 1', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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

    it('should aggregate batch with CRA_ALL_REJECTED when all details are errors', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '007',
      })
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchStatus).toHaveBeenCalledWith(
        10,
        BATCH_EVENT.CRA_ALL_REJECTED,
        { additionalData: { systemComments: expect.any(String) } },
      )
    })

    it('should return metadata with records_rejected: 1', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '007',
      })
      setupHttpForFile(VALID_FILE_NAME)
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

  // ─── Recycled (tranStatCd='2' with reject code 998) ─────────────────────────

  describe('Recycled (tranStatCd=2 with reject code 998)', () => {
    it('should NOT call updateBatchDetailStatus', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '998',
      })
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).not.toHaveBeenCalled()
    })

    it('should NOT call updateCsaStatus', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '998',
      })
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      await handler.execute(mockContext)

      expect(mockContactsService.updateCsaStatus).not.toHaveBeenCalled()
    })

    it('should update systemComments directly via prisma', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '998',
      })
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      await handler.execute(mockContext)

      expect(mockPrisma.contactBatchDetail.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { systemComments: expect.any(String), lastUpdatedBy: 'SYSTEM' },
      })
    })

    it('should keep batch in_progress (no batch status transition)', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '998',
      })
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      // Only in_progress details remain — aggregateBatchStatus returns early
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchStatus).not.toHaveBeenCalled()
    })

    it('should return metadata with records_recycled: 1', async () => {
      const detail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '998',
      })
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      const result = await handler.execute(mockContext)

      expect(result.metadata.records_recycled).toBe(1)
      expect(result.metadata.records_accepted).toBe(0)
      expect(result.metadata.records_rejected).toBe(0)
    })
  })

  // ─── Recycled (tranStatCd='3') ──────────────────────────────────────────────

  describe('Recycled (tranStatCd=3)', () => {
    it('should NOT call updateBatchDetailStatus', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_RECYCLED })
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
      setupHttpForFile(VALID_FILE_NAME)
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
    it('should aggregate with CRA_PARTIAL_REJECTED when batch has accepted and rejected', async () => {
      const acceptedDetail = makeDetail({
        referenceNum: '100',
        tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED,
      })
      const rejectedDetail = makeDetail({
        referenceNum: '101',
        tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
        rejectCd1: '007',
      })

      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([acceptedDetail, rejectedDetail])

      // Two sequential findUnique calls for the two details
      setupBatchDetail(100, 1, 10)
      setupBatchDetail(101, 2, 10)

      // For accepted detail DIN check
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })

      // After processing both, aggregation sees mixed statuses
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchStatus).toHaveBeenCalledWith(
        10,
        BATCH_EVENT.CRA_PARTIAL_REJECTED,
        { additionalData: { systemComments: expect.any(String) } },
      )
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

      setupHttpForFile(VALID_FILE_NAME)
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

  // ─── TransferFile record ──────────────────────────────────────────────────

  describe('TransferFile record', () => {
    it('should create TransferFile with direction INBOUND and correct data', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockPrisma.transferFile.create).toHaveBeenCalledWith({
        data: {
          destinationId: DESTINATION_ID,
          direction: 'INBOUND',
          fileName: VALID_FILE_NAME,
          fileSize: '100',
          deliveredAt: expect.any(Date),
          downloadedAt: expect.any(Date),
          referenceNumbers: [100],
        },
      })
    })

    it('should include all referenceNumbers from details', async () => {
      const detail1 = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      const detail2 = makeDetail({ referenceNum: '200', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })

      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail1, detail2])
      setupBatchDetail(100, 1, 10)
      setupBatchDetail(200, 2, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(mockPrisma.transferFile.create).toHaveBeenCalledWith({
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
      setupHttpForFile(VALID_FILE_NAME)
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
      mockHttpService.get
        .mockReturnValueOnce(of({ data: { files: [{ fileName: 'craUserId.VRSP0002.txt' }] } }))
        .mockReturnValueOnce(of({ data: Buffer.from('dummy-file-content-2') }))
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
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      mockPrisma.contactBatchDetail.findUnique.mockResolvedValue(null)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([])

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(mockBatchesService.updateBatchDetailStatus).not.toHaveBeenCalled()
      expect(mockContactsService.updateCsaStatus).not.toHaveBeenCalled()
    })
  })

  // ─── File download and save ───────────────────────────────────────────────

  describe('File download and save', () => {
    it('should download the file from file transfer service', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      // First call: list remote files
      expect(mockHttpService.get).toHaveBeenCalledWith(
        `http://file-transfer/api/destinations/${DESTINATION_ID}/remote-files`,
        { headers: { 'Content-Type': 'application/json' } },
      )

      // Second call: download file
      expect(mockHttpService.get).toHaveBeenCalledWith(
        `http://file-transfer/api/destinations/${DESTINATION_ID}/local/inbound/files/${VALID_FILE_NAME}`,
        { headers: { 'Content-Type': 'text/plain' }, responseType: 'arraybuffer' },
      )
    })

    it('should save the file to local storage', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
      ])

      await handler.execute(mockContext)

      expect(fsPromises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(VALID_FILE_NAME),
        expect.any(Buffer),
      )
    })

    it('should return files_processed: 1 on success', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupHttpForFile(VALID_FILE_NAME)
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
    it('should not call updateBatchStatus when some details are still in_progress', async () => {
      const detail = makeDetail({ referenceNum: '100', tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED })
      setupHttpForFile(VALID_FILE_NAME)
      setupParseFile([detail])
      setupBatchDetail(100, 1, 10)
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 1, din: null })
      // Some details are still in_progress (not all responses received yet)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.PROCESSED },
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])

      await handler.execute(mockContext)

      expect(mockBatchesService.updateBatchStatus).not.toHaveBeenCalled()
    })
  })
})
