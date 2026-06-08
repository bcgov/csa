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
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      $queryRaw: vi.fn().mockResolvedValue([{ next: 5 }]),
      $transaction: vi.fn().mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) =>
        fn(mockPrisma),
      ),
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
      mockPrisma.batch.findFirst.mockResolvedValue(null)
      mockPrisma.batch.create.mockResolvedValue({
        id: 99,
        batchNumber: 5,
        initiatedBy: 'CRA',
        status: 'in_progress',
        recordCount: 0,
        batchDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        systemComments: null,
      })

      const batch = await service.createWklBatchForUnmatchedRecords(buildHeader())

      expect(mockPrisma.$transaction).toHaveBeenCalled()
      expect(mockPrisma.$executeRaw).toHaveBeenCalled()
      expect(mockPrisma.batch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          batchNumber: 5,
          initiatedBy: 'CRA',
          status: 'in_progress',
          recordCount: 0,
        }),
      })
      expect(batch.id).toBe(99)
    })

    it('should return existing CRA in_progress batch without creating', async () => {
      const existing = { id: 67, batchNumber: 3, initiatedBy: 'CRA', status: 'in_progress' }
      mockPrisma.batch.findFirst.mockResolvedValue(existing)

      const batch = await service.createWklBatchForUnmatchedRecords(buildHeader())

      expect(mockPrisma.batch.create).not.toHaveBeenCalled()
      expect(batch).toBe(existing)
    })
  })

  describe('createBatchDetailsForWklUnmatchedRecords', () => {
    const snapshot = { childGivenName: 'A', childSurName: 'B', childBirthDate: '20200101' }

    beforeEach(() => {
      mockPrisma.contactBatchDetail.findFirst = vi.fn().mockResolvedValue(null)
      mockPrisma.contactBatchDetail.create = vi.fn().mockResolvedValue({ id: 1 })
      mockPrisma.contactBatchDetail.update = vi.fn().mockResolvedValue({})
      mockPrisma.contactBatchDetail.findUnique = vi.fn().mockResolvedValue({
        id: 1,
        contactId: 1,
        batchId: 1,
        transactionType: 'cancellation',
        systemComments: null,
        craMatchingSnapshot: snapshot,
        contact: { din: null },
      })
      mockPrisma.$transaction = vi.fn().mockImplementation(async (cb: any) =>
        cb({
          contactBatchDetail: {
            create: mockPrisma.contactBatchDetail.create,
            update: mockPrisma.contactBatchDetail.update,
            findUnique: mockPrisma.contactBatchDetail.findUnique,
          },
        }),
      )
    })

    // Initial status must be IN_PROGRESS — it is the only batch detail state with
    // valid CRA_WKL_APPROVED / CRA_WKL_REFUSED outgoing transitions, which the
    // handler fires immediately after this method returns.
    it.each(['Completed', 'Updated', 'Abandoned', 'In-Progress'])(
      'creates the batch detail in IN_PROGRESS for CRA status %s',
      async (craStatus) => {
        await service.createBatchDetailsForWklUnmatchedRecords(
          1,
          1,
          'cancellation',
          craStatus,
          'CASE-1',
          snapshot,
        )

        expect(mockPrisma.contactBatchDetail.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ status: BATCH_DETAIL_STATUS.IN_PROGRESS }),
        })
      },
    )
  })
})
