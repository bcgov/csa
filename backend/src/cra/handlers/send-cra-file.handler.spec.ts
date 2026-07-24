import { AppLogger } from 'src/common/logger/app-logger'
import { BATCH_EVENT, CSA_EVENT } from 'src/common/state-machine/constants'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { SendCraFileHandler } from './send-cra-file.handler'

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('mock-file-content')),
}))

const DESTINATION_ID = CRA_DATA_HANDLING_CONSTANT.DESTINATION_ID

const mockContext: JobContext = {
  jobRunId: 1,
  jobType: JobType.SEND_CRA_FILE,
  jobTrigger: JobTrigger.CRON,
  retryCount: 0,
}

const makeBatch = (overrides = {}) => ({
  id: 10,
  batchNumber: 10,
  batchDate: null,
  status: 'pending',
  recordCount: 2,
  createdAt: new Date(),
  systemComments: null,
  ...overrides,
})

const makeContact = (overrides = {}) => ({
  id: 1,
  firstName: 'EMILY',
  middleName: 'A',
  lastName: 'SMITH',
  akaFirstName: '',
  akaLastName: '',
  personIdIcm: 'ICM001',
  dateOfBirth: new Date(2015, 1, 15),
  gender: 'F',
  birthCity: 'TORONTO',
  birthProvince: 'ON',
  birthCountry: 'CA',
  din: '987654321',
  effectiveDate: new Date(2024, 5, 1),
  legacyFileNumber: 'LFN001',
  prevRecipientFirstName: null,
  prevRecipientLastName: null,
  cancelReasonCode: null,
  careEndDate: null,
  csaStatus: 'in_batch_application',
  ...overrides,
})

const makeBatchDetail = (overrides: Record<string, any> = {}) => {
  const id = overrides.id ?? 100
  return {
    id,
    contactId: 1,
    batchId: 10,
    transactionType: 'application',
    referenceNumber: `LFN001-${id}`,
    status: 'pending',
    contact: makeContact(),
    ...overrides,
  }
}

describe('SendCraFileHandler', () => {
  let handler: SendCraFileHandler
  let mockPrisma: any
  let mockBatchesService: any
  let mockContactsService: any
  let mockJobsService: any
  let mockOutboundDataService: any
  let mockOutboundFileService: any
  let mockCraTransferService: any
  let mockIcmSyncBackService: any

  beforeEach(() => {
    mockPrisma = {
      batch: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      contactBatchDetail: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      transferFile: {
        create: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _max: { sequenceNumber: null } }),
      },
    }

    mockBatchesService = {
      updateBatchStatus: vi.fn().mockResolvedValue({ success: true }),
      updateBatchDetailStatus: vi.fn().mockResolvedValue({ success: true }),
    }

    mockContactsService = {
      updateCsaStatus: vi.fn().mockResolvedValue({ success: true }),
    }

    mockJobsService = {
      addActivity: vi.fn().mockResolvedValue(undefined),
    }

    mockOutboundDataService = {
      buildCraFileData: vi.fn().mockReturnValue({
        header: { tranCode: 6133 },
        details: [{ tranCode: 6134 }, { tranCode: 6134 }],
        trailer: { tranCode: 6135 },
      }),
      buildMatchingSnapshot: vi.fn().mockImplementation((_detail: any) => ({
        childGivenName: 'EMILY',
        childSurName: 'SMITH',
        childSex: 'F',
        childBirthDate: '20150215',
        childBirthCity: 'TORONTO',
        childBirthProv: 'ON',
        childBirthCountry: 'CA',
        ccraDinNum: '987654321',
      })),
    }

    mockOutboundFileService = {
      createFile: vi.fn().mockReturnValue({
        filePath: '/tmp/cra/testfile.txt',
        fileName: 'testfile.txt',
        recordCount: 3,
      }),
    }

    mockCraTransferService = {
      sendFile: vi.fn().mockResolvedValue({ success: true, fileName: 'testfile.txt' }),
    }

    mockIcmSyncBackService = {
      syncFlaggedWithRetry: vi
        .fn()
        .mockResolvedValue({ totalFlagged: 0, synced: 0, failed: 0, chunks: 0 }),
    }

    const mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, any> = {
          'cra.lastSequenceNumber': 0,
        }
        return config[key]
      }),
    }

    handler = new SendCraFileHandler(
      mockPrisma,
      mockConfigService as any,
      mockBatchesService,
      mockContactsService,
      mockOutboundDataService,
      mockOutboundFileService,
      mockCraTransferService,
      mockJobsService,
      mockIcmSyncBackService,
    )
  })

  it('should have jobType SEND_CRA_FILE', () => {
    expect(handler.jobType).toBe(JobType.SEND_CRA_FILE)
  })

  describe('No actionable batch', () => {
    it('should return success with "No batch to process" when no batch found', async () => {
      mockPrisma.batch.findFirst.mockResolvedValue(null)

      await handler.onStart(mockContext)
      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.message).toContain('No batch to process')
      expect(result.metadata).toEqual({ no_batch: true })
      expect(mockBatchesService.updateBatchStatus).not.toHaveBeenCalled()
      expect(mockOutboundFileService.createFile).not.toHaveBeenCalled()
    })
  })

  describe('Batch with no contacts', () => {
    it('should not transition batch and return "No batch to process"', async () => {
      mockPrisma.batch.findFirst.mockResolvedValue(makeBatch())
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([])

      await handler.onStart(mockContext)
      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.message).toContain('No batch to process')
      expect(result.metadata).toEqual({ no_batch: true })
      expect(mockBatchesService.updateBatchStatus).not.toHaveBeenCalled()
      expect(mockOutboundFileService.createFile).not.toHaveBeenCalled()
    })
  })

  describe('onStart', () => {
    let batch: any
    let detail1: any
    let detail2: any

    beforeEach(() => {
      batch = makeBatch({ id: 10 })
      detail1 = makeBatchDetail({
        id: 100,
        contactId: 1,
        batchId: 10,
        contact: makeContact({ id: 1 }),
      })
      detail2 = makeBatchDetail({
        id: 101,
        contactId: 2,
        batchId: 10,
        contact: makeContact({ id: 2 }),
      })

      mockPrisma.batch.findFirst.mockResolvedValue(batch)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([detail1, detail2])
    })

    it('should transition batch to in_progress via SEND_TO_CRA', async () => {
      await handler.onStart(mockContext)

      expect(mockBatchesService.updateBatchStatus).toHaveBeenCalledWith(10, BATCH_EVENT.SEND_TO_CRA)
    })

    it('should transition all batch details to in_progress via SEND_TO_CRA', async () => {
      await handler.onStart(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledTimes(2)
      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        100,
        BATCH_EVENT.SEND_TO_CRA,
      )
      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        101,
        BATCH_EVENT.SEND_TO_CRA,
      )
    })

    it('should skip detail transition if already in_progress', async () => {
      detail1.status = 'in_progress'
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([detail1, detail2])

      await handler.onStart(mockContext)

      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledTimes(1)
      expect(mockBatchesService.updateBatchDetailStatus).toHaveBeenCalledWith(
        101,
        BATCH_EVENT.SEND_TO_CRA,
      )
    })
  })

  describe('execute (happy path)', () => {
    let batch: any
    let detail1: any
    let detail2: any

    beforeEach(async () => {
      batch = makeBatch({ id: 10 })
      detail1 = makeBatchDetail({
        id: 100,
        contactId: 1,
        batchId: 10,
        contact: makeContact({ id: 1 }),
      })
      detail2 = makeBatchDetail({
        id: 101,
        contactId: 2,
        batchId: 10,
        contact: makeContact({ id: 2 }),
      })

      mockPrisma.batch.findFirst.mockResolvedValue(batch)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([detail1, detail2])
      mockPrisma.batch.update.mockResolvedValue({ ...batch, batchDate: new Date() })
      mockPrisma.transferFile.create.mockResolvedValue({ id: 1 })

      await handler.onStart(mockContext)
    })

    it('should build CRA file data from batch details', async () => {
      await handler.execute(mockContext)

      expect(mockOutboundDataService.buildCraFileData).toHaveBeenCalledWith([detail1, detail2])
    })

    it('should create and transfer the file', async () => {
      await handler.execute(mockContext)

      expect(mockOutboundFileService.createFile).toHaveBeenCalledWith(
        { tranCode: 6133 },
        [{ tranCode: 6134 }, { tranCode: 6134 }],
        { tranCode: 6135 },
        DESTINATION_ID,
        1,
      )

      expect(mockCraTransferService.sendFile).toHaveBeenCalledWith(
        'testfile.txt',
        expect.any(Buffer),
      )
    })

    it('should create TransferFile record with correct data', async () => {
      await handler.execute(mockContext)

      expect(mockPrisma.transferFile.create).toHaveBeenCalledWith({
        data: {
          batchId: 10,
          destinationId: DESTINATION_ID,
          direction: 'OUTBOUND',
          fileType: 'REQUEST',
          fileName: 'testfile.txt',
          deliveredAt: expect.any(Date),
          referenceNumbers: ['LFN001-100', 'LFN001-101'],
          sequenceNumber: 1,
        },
      })
    })

    it('should return success with metadata', async () => {
      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.message).toContain('Batch 10')
      expect(result.metadata).toEqual({
        batch_id: 10,
        file_path: '/tmp/cra/testfile.txt',
        file_name: 'testfile.txt',
        record_count: 3,
        contacts_count: 2,
      })
    })

    it('should save craMatchingSnapshot on each batch detail', async () => {
      await handler.execute(mockContext)

      expect(mockOutboundDataService.buildMatchingSnapshot).toHaveBeenCalledTimes(2)
      expect(mockPrisma.contactBatchDetail.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: {
          craMatchingSnapshot: {
            childGivenName: 'EMILY',
            childSurName: 'SMITH',
            childSex: 'F',
            childBirthDate: '20150215',
            childBirthCity: 'TORONTO',
            childBirthProv: 'ON',
            childBirthCountry: 'CA',
            ccraDinNum: '987654321',
          },
        },
      })
      expect(mockPrisma.contactBatchDetail.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          craMatchingSnapshot: expect.objectContaining({
            childGivenName: 'EMILY',
            childSurName: 'SMITH',
          }),
        },
      })
    })

    it('should wrap sequence number from 9999 to 1', async () => {
      mockPrisma.transferFile.aggregate.mockResolvedValue({ _max: { sequenceNumber: 9999 } })

      await handler.execute(mockContext)

      expect(mockOutboundFileService.createFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        DESTINATION_ID,
        1,
      )
    })
  })

  describe('onSuccess', () => {
    let batch: any
    let detail1: any
    let detail2: any

    beforeEach(async () => {
      batch = makeBatch({ id: 10 })
      detail1 = makeBatchDetail({
        id: 100,
        contactId: 1,
        batchId: 10,
        contact: makeContact({ id: 1 }),
      })
      detail2 = makeBatchDetail({
        id: 101,
        contactId: 2,
        batchId: 10,
        contact: makeContact({ id: 2 }),
      })

      mockPrisma.batch.findFirst.mockResolvedValue(batch)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([detail1, detail2])
      mockPrisma.batch.update.mockResolvedValue({ ...batch, batchDate: new Date() })

      await handler.onStart(mockContext)
    })

    it('should update contact CSA statuses via SEND_TO_CRA with csaSentDate', async () => {
      const result = { success: true, message: 'Batch 10 sent to CRA' }
      await handler.onSuccess(mockContext, result)

      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledTimes(2)
      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        1,
        CSA_EVENT.SEND_TO_CRA,
        'SYSTEM',
        { additionalData: { csaSentDate: expect.any(Date) }, origin: 'SendCraFileHandler' },
      )
      expect(mockContactsService.updateCsaStatus).toHaveBeenCalledWith(
        2,
        CSA_EVENT.SEND_TO_CRA,
        'SYSTEM',
        { additionalData: { csaSentDate: expect.any(Date) }, origin: 'SendCraFileHandler' },
      )
    })

    it('should call syncFlaggedWithRetry', async () => {
      const result = { success: true, message: 'Batch 10 sent to CRA' }
      await handler.onSuccess(mockContext, result)

      expect(mockIcmSyncBackService.syncFlaggedWithRetry).toHaveBeenCalled()
    })

    it('should succeed even if sync-back throws', async () => {
      mockIcmSyncBackService.syncFlaggedWithRetry.mockRejectedValue(new Error('ICM API down'))
      const result = { success: true, message: 'Batch 10 sent to CRA' }

      await expect(handler.onSuccess(mockContext, result)).resolves.not.toThrow()
    })

    it('should set batchDate on the batch', async () => {
      const result = { success: true, message: 'Batch 10 sent to CRA' }
      await handler.onSuccess(mockContext, result)

      expect(mockPrisma.batch.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { batchDate: expect.any(Date) },
      })
    })
  })

  describe('onFailure', () => {
    it('should transition batch to system_error (SEND_FAILED) with batch system comments', async () => {
      const batch = makeBatch({ id: 10 })
      const detail = makeBatchDetail({ id: 100, contactId: 1, batchId: 10 })

      mockPrisma.batch.findFirst.mockResolvedValue(batch)
      mockPrisma.batch.findUnique.mockResolvedValue({ systemComments: null })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([detail])

      await handler.onStart(mockContext)
      await handler.onFailure(mockContext, new Error('Connection refused'))

      expect(mockBatchesService.updateBatchStatus).toHaveBeenCalledWith(
        10,
        BATCH_EVENT.SEND_FAILED,
        { additionalData: { systemComments: expect.stringContaining('Connection refused') } },
      )
      expect(mockPrisma.contactBatchDetail.update).not.toHaveBeenCalled()
    })

    it('should warn and persist batch failure state when status transition fails', async () => {
      const batch = makeBatch({ id: 10 })
      const detail = makeBatchDetail({ id: 100, contactId: 1, batchId: 10 })
      const warnSpy = vi.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => undefined)

      mockPrisma.batch.findFirst.mockResolvedValue(batch)
      mockPrisma.batch.findUnique.mockResolvedValue({
        systemComments: 'existing comment',
        status: 'pending',
      })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([detail])
      mockBatchesService.updateBatchStatus
        .mockResolvedValueOnce({ success: true, from: 'pending', to: 'in_progress' })
        .mockResolvedValueOnce({
          success: false,
          reason: 'Invalid transition',
        })

      await handler.onStart(mockContext)
      await handler.onFailure(mockContext, new Error('Connection refused'))

      expect(warnSpy).toHaveBeenCalledWith(
        'Batch 10: SEND_FAILED transition failed (Invalid transition); persisted systemComments and status via direct update',
      )
      expect(mockPrisma.batch.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          systemComments: expect.stringContaining('Connection refused'),
          status: 'system_error',
        },
      })
      expect(mockPrisma.contactBatchDetail.update).not.toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    it('should warn with Issue 1 message when only systemComments can be persisted', async () => {
      const batch = makeBatch({ id: 10, status: 'processed' })
      const warnSpy = vi.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => undefined)

      mockPrisma.batch.findUnique.mockResolvedValue({
        systemComments: null,
        status: 'processed',
      })
      mockBatchesService.updateBatchStatus.mockResolvedValue({
        success: false,
        reason: 'Invalid transition',
      })
      ;(handler as any).batch = batch

      await handler.onFailure(mockContext, new Error('Connection refused'))

      expect(warnSpy).toHaveBeenCalledWith(
        'Batch 10: SEND_FAILED transition failed (Invalid transition); persisted systemComments only',
      )
      expect(mockPrisma.batch.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { systemComments: expect.stringContaining('Connection refused') },
      })

      warnSpy.mockRestore()
    })

    it('should mark pending batch as system_error when send transition never completed', async () => {
      const batch = makeBatch({ id: 10, status: 'pending' })
      const detail = makeBatchDetail({ id: 100, contactId: 1, batchId: 10 })

      mockPrisma.batch.findFirst.mockResolvedValue(batch)
      mockPrisma.batch.findUnique.mockResolvedValue({ systemComments: null, status: 'pending' })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([detail])
      mockBatchesService.updateBatchStatus
        .mockResolvedValueOnce({ success: true, from: 'pending', to: 'in_progress' })
        .mockResolvedValueOnce({ success: true, from: 'pending', to: 'system_error' })

      await handler.onStart(mockContext)
      await handler.onFailure(mockContext, new Error('Connection refused'))

      expect(mockBatchesService.updateBatchStatus).toHaveBeenLastCalledWith(
        10,
        BATCH_EVENT.SEND_FAILED,
        { additionalData: { systemComments: expect.stringContaining('Connection refused') } },
      )
    })

    it('should throw when batch cannot transition to in_progress', async () => {
      const batch = makeBatch({ id: 10 })
      const detail = makeBatchDetail({ id: 100, contactId: 1, batchId: 10 })

      mockPrisma.batch.findFirst.mockResolvedValue(batch)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([detail])
      mockBatchesService.updateBatchStatus.mockResolvedValue({
        success: false,
        reason: 'Invalid transition',
      })

      await expect(handler.onStart(mockContext)).rejects.toThrow(
        'Failed to transition batch 10 to in_progress: Invalid transition',
      )
    })

    it('should not transition if no batch was found', async () => {
      mockPrisma.batch.findFirst.mockResolvedValue(null)

      await handler.onStart(mockContext)
      await handler.onFailure(mockContext, new Error('Some error'))

      expect(mockBatchesService.updateBatchStatus).not.toHaveBeenCalled()
    })
  })

  describe('Transfer failure', () => {
    it('should throw when file transfer fails', async () => {
      const batch = makeBatch({ id: 10 })
      const detail = makeBatchDetail({ id: 100, contactId: 1, batchId: 10 })

      mockPrisma.batch.findFirst.mockResolvedValue(batch)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([detail])

      mockCraTransferService.sendFile.mockRejectedValue(new Error('Connection refused'))

      await handler.onStart(mockContext)
      await expect(handler.execute(mockContext)).rejects.toThrow('Connection refused')
    })

    it('should not update contact CSA statuses on transfer failure', async () => {
      const batch = makeBatch({ id: 10 })
      const detail = makeBatchDetail({ id: 100, contactId: 1, batchId: 10 })

      mockPrisma.batch.findFirst.mockResolvedValue(batch)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([detail])

      mockCraTransferService.sendFile.mockRejectedValue(new Error('Transfer failed'))

      await handler.onStart(mockContext)
      await expect(handler.execute(mockContext)).rejects.toThrow()

      expect(mockContactsService.updateCsaStatus).not.toHaveBeenCalled()
    })

    it('should not create TransferFile record on transfer failure', async () => {
      const batch = makeBatch({ id: 10 })
      const detail = makeBatchDetail({ id: 100, contactId: 1, batchId: 10 })

      mockPrisma.batch.findFirst.mockResolvedValue(batch)
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([detail])

      mockCraTransferService.sendFile.mockRejectedValue(new Error('Transfer failed'))

      await handler.onStart(mockContext)
      await expect(handler.execute(mockContext)).rejects.toThrow()

      expect(mockPrisma.transferFile.create).not.toHaveBeenCalled()
    })
  })
})
