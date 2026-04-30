import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BATCH_DETAIL_STATUS, BATCH_EVENT, BATCH_STATUS } from 'src/common/state-machine/constants'
import { BatchesService } from './batches.service'
import { RecordTypeCode, TranCode, HeaderRecord } from 'src/cra/inbound/inbound-weekly.interface'

describe('BatchesService', () => {
  let service: BatchesService
  let mockPrisma: any
  let mockStateMachine: any
  let mockContactsService: any

  const buildHeader = (): HeaderRecord => ({
    tranCode: TranCode.HEADER,
    recordTypeCode: RecordTypeCode.HEADER,
    filler1: '',
    processDate: '20250101',
    filler2: '',
  })

  beforeEach(() => {
    mockPrisma = {
      contactBatchDetail: { findMany: vi.fn() },
      batch: {
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    }

    mockStateMachine = {
      transitionBatch: vi.fn(),
    }

    mockContactsService = {}

    service = new BatchesService(mockPrisma, mockStateMachine, mockContactsService)
  })

  describe('aggregateBatchStatus', () => {
    beforeEach(() => {
      vi.spyOn(service, 'updateBatchStatus').mockResolvedValue({
        success: true,
        from: 'in_progress',
        to: 'processed',
      })
    })

    it('should return early when batch has no details', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([])

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).not.toHaveBeenCalled()
      expect(mockPrisma.batch.update).not.toHaveBeenCalled()
    })

    it('should add CRA Acknowledgement Received comment when all details are in_progress', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({ systemComments: null })
      mockPrisma.batch.update.mockResolvedValue({})

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).not.toHaveBeenCalled()
      expect(mockPrisma.batch.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          systemComments: expect.stringContaining('CRA Acknowledgement received.'),
        },
      })
    })

    it('should add CRA Acknowledgement received. comment when details are mix of in_progress and error', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({ systemComments: null })
      mockPrisma.batch.update.mockResolvedValue({})

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).not.toHaveBeenCalled()
      expect(mockPrisma.batch.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          systemComments: expect.stringContaining('CRA Acknowledgement received.'),
        },
      })
    })

    it('should transition to CRA_ALL_REJECTED when all details are error', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.ERROR },
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({ systemComments: null })

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).toHaveBeenCalledWith(1, BATCH_EVENT.CRA_ALL_REJECTED, {
        additionalData: {
          systemComments: expect.stringContaining(
            'CRA sent back Error for all transactions in Response file. Please review.',
          ),
        },
      })
    })

    it('should transition to CRA_ALL_PROCESSED with "All accepted" when all details are approved', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
        { status: BATCH_DETAIL_STATUS.APPROVED },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({ systemComments: null })

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).toHaveBeenCalledWith(1, BATCH_EVENT.CRA_ALL_PROCESSED, {
        additionalData: {
          systemComments: expect.stringContaining('All accepted by CRA.'),
        },
      })
    })

    it('should transition to CRA_ALL_PROCESSED with "All refused" when all details are refused', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.REFUSED },
        { status: BATCH_DETAIL_STATUS.REFUSED },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({ systemComments: null })

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).toHaveBeenCalledWith(1, BATCH_EVENT.CRA_ALL_PROCESSED, {
        additionalData: {
          systemComments: expect.stringContaining('All refused by CRA.'),
        },
      })
    })

    it('should transition to CRA_ALL_PROCESSED with "Some accepted, some refused" when mix of approved and refused', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
        { status: BATCH_DETAIL_STATUS.REFUSED },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({ systemComments: null })

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).toHaveBeenCalledWith(1, BATCH_EVENT.CRA_ALL_PROCESSED, {
        additionalData: {
          systemComments: expect.stringContaining('Some accepted, some refused by CRA.'),
        },
      })
    })

    it('should transition to CRA_PARTIALLY_PROCESSED with "All accepted so far" when approved + in_progress and batch is in_progress', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({
        status: BATCH_STATUS.IN_PROGRESS,
        systemComments: null,
      })

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).toHaveBeenCalledWith(
        1,
        BATCH_EVENT.CRA_PARTIALLY_PROCESSED,
        {
          additionalData: {
            systemComments: expect.stringContaining('All accepted by CRA so far.'),
          },
        },
      )
    })

    it('should transition to CRA_PARTIALLY_PROCESSED with "All refused so far" when refused + in_progress and batch is in_progress', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.REFUSED },
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({
        status: BATCH_STATUS.IN_PROGRESS,
        systemComments: null,
      })

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).toHaveBeenCalledWith(
        1,
        BATCH_EVENT.CRA_PARTIALLY_PROCESSED,
        {
          additionalData: {
            systemComments: expect.stringContaining('All refused by CRA so far.'),
          },
        },
      )
    })

    it('should transition to CRA_PARTIALLY_PROCESSED with "Some accepted, some refused so far" when approved + refused + in_progress and batch is in_progress', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
        { status: BATCH_DETAIL_STATUS.REFUSED },
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({
        status: BATCH_STATUS.IN_PROGRESS,
        systemComments: null,
      })

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).toHaveBeenCalledWith(
        1,
        BATCH_EVENT.CRA_PARTIALLY_PROCESSED,
        {
          additionalData: {
            systemComments: expect.stringContaining('Some accepted, some refused by CRA so far.'),
          },
        },
      )
    })

    it('should update comments directly when approved + in_progress and batch is already partially_processed', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({
        status: BATCH_STATUS.PARTIALLY_PROCESSED,
        systemComments: 'existing comment',
      })
      mockPrisma.batch.update.mockResolvedValue({})

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).not.toHaveBeenCalled()
      expect(mockPrisma.batch.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          systemComments: expect.stringContaining('All accepted by CRA so far.'),
        },
      })
    })

    it('should transition to CRA_ALL_PROCESSED with "All accepted" when approved + error (no in_progress)', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.APPROVED },
        { status: BATCH_DETAIL_STATUS.ERROR },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({ systemComments: null })

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).toHaveBeenCalledWith(1, BATCH_EVENT.CRA_ALL_PROCESSED, {
        additionalData: {
          systemComments: expect.stringContaining('All accepted by CRA.'),
        },
      })
    })

    it('should transition to CRA_PARTIALLY_PROCESSED with "All refused so far" when refused + error + in_progress', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        { status: BATCH_DETAIL_STATUS.REFUSED },
        { status: BATCH_DETAIL_STATUS.ERROR },
        { status: BATCH_DETAIL_STATUS.IN_PROGRESS },
      ])
      mockPrisma.batch.findUnique.mockResolvedValue({
        status: BATCH_STATUS.IN_PROGRESS,
        systemComments: null,
      })

      await service.aggregateBatchStatus(1)

      expect(service.updateBatchStatus).toHaveBeenCalledWith(
        1,
        BATCH_EVENT.CRA_PARTIALLY_PROCESSED,
        {
          additionalData: {
            systemComments: expect.stringContaining('All refused by CRA so far.'),
          },
        },
      )
    })
  })

  describe('createWklBatchForUnmatchedRecords', () => {
    it('should create a batch with initiatedBy CRA and status in_progress', async () => {
      mockPrisma.batch.create.mockResolvedValue({
        id: 99,
        initiatedBy: 'CRA',
        status: 'in_progress',
        recordCount: 0,
        batchDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        systemComments: null,
      })

      const batch = await service.createWklBatchForUnmatchedRecords(buildHeader())

      expect(mockPrisma.batch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          initiatedBy: 'CRA',
          status: 'in_progress',
          recordCount: 0,
        }),
      })
      expect(batch.id).toBe(99)
    })
  })
})
