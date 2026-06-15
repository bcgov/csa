import { BATCH_DETAIL_STATUS, BATCH_EVENT, BATCH_STATUS } from 'src/common/state-machine/constants'
import { HeaderRecord, RecordTypeCode, TranCode } from 'src/cra/inbound/inbound-weekly.interface'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchesService } from './batches.service'

describe('BatchesService', () => {
  let service: BatchesService
  let mockPrisma: any
  let mockStateMachine: any
  let mockContactsService: any
  let mockIcmSyncBackService: any

  const buildHeader = (): HeaderRecord => ({
    tranCode: TranCode.HEADER,
    recordTypeCode: RecordTypeCode.HEADER,
    filler1: '',
    processDate: '20250101',
    filler2: '',
  })

  beforeEach(() => {
    mockPrisma = {
      contactBatchDetail: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      batch: {
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      contact: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      $queryRaw: vi.fn().mockResolvedValue([{ next: 5 }]),
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma)),
    }

    mockStateMachine = {
      transitionBatch: vi.fn(),
    }

    mockContactsService = {
      updateCsaStatus: vi.fn(),
    }

    mockIcmSyncBackService = {
      syncSingleContact: vi.fn().mockResolvedValue(undefined),
    }

    service = new BatchesService(
      mockPrisma,
      mockStateMachine,
      mockContactsService,
      mockIcmSyncBackService,
    )
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

  describe('findOrCreatePendingBatch', () => {
    it('should create a pending batch with the next batch_number', async () => {
      mockPrisma.batch.findFirst.mockResolvedValue(null)
      mockPrisma.batch.create.mockResolvedValue({
        id: 10,
        batchNumber: 5,
        status: BATCH_STATUS.PENDING,
        recordCount: 0,
        batchDate: null,
        createdAt: new Date(),
        systemComments: null,
      })

      const batch = await service.findOrCreatePendingBatch()

      expect(mockPrisma.$transaction).toHaveBeenCalled()
      expect(mockPrisma.$executeRaw).toHaveBeenCalled()
      expect(mockPrisma.$queryRaw).toHaveBeenCalled()
      expect(mockPrisma.batch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          batchNumber: 5,
          status: BATCH_STATUS.PENDING,
          recordCount: 0,
        }),
      })
      expect(batch.batchNumber).toBe(5)
    })

    it('should return existing pending batch without creating', async () => {
      const existing = { id: 3, batchNumber: 2, status: BATCH_STATUS.PENDING, recordCount: 1 }
      mockPrisma.batch.findFirst.mockResolvedValue(existing)

      const batch = await service.findOrCreatePendingBatch()

      expect(mockPrisma.batch.create).not.toHaveBeenCalled()
      expect(batch).toEqual({ ...existing, statusLabel: 'Pending' })
    })
  })

  describe('findInProgressBatchDetailForContact', () => {
    it('returns the in-progress batch detail for a contact', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        {
          id: 10,
          contactId: 99,
          batchId: 500,
          transactionType: 'application',
          systemComments: null,
          contact: { din: '123456789' },
        },
      ])

      const detail = await service.findInProgressBatchDetailForContact(99)

      expect(detail).toEqual({
        id: 10,
        contactId: 99,
        batchId: 500,
        transactionType: 'application',
        systemComments: null,
        contact: { din: '123456789' },
      })
    })

    it('returns null when contact has no in-progress batch detail', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([])

      const detail = await service.findInProgressBatchDetailForContact(99)

      expect(detail).toBeNull()
    })
  })

  describe('findOrCreateWklBatchForUnmatchedRecords', () => {
    it('returns existing CRA batch for the batch date', async () => {
      const batchDate = new Date('2025-04-21')
      const existing = { id: 67, batchNumber: 3, initiatedBy: 'CRA', batchDate }
      mockPrisma.batch.findFirst.mockResolvedValue(existing)

      const batch = await service.findOrCreateWklBatchForUnmatchedRecords(batchDate)

      expect(mockPrisma.batch.create).not.toHaveBeenCalled()
      expect(batch).toBe(existing)
    })

    it('creates a CRA batch when none exists for the batch date', async () => {
      const batchDate = new Date('2025-04-21')
      mockPrisma.batch.findFirst.mockResolvedValue(null)
      mockPrisma.batch.create.mockResolvedValue({
        id: 99,
        batchNumber: 5,
        initiatedBy: 'CRA',
        status: 'in_progress',
        batchDate,
      })

      const batch = await service.findOrCreateWklBatchForUnmatchedRecords(batchDate)

      expect(mockPrisma.batch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          batchNumber: 5,
          batchDate,
          initiatedBy: 'CRA',
          status: 'in_progress',
        }),
      })
      expect(batch.id).toBe(99)
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
      mockPrisma.contact.findUnique = vi.fn().mockResolvedValue({
        effectiveDate: new Date('2025-01-15'),
        careEndDate: new Date('2025-02-20'),
        cancelReasonCode: '21',
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

  describe('findBatchContacts - User Story 39432', () => {
    it('should use batch detail effectiveDate and cancelReasonCode when available', async () => {
      const batchDetailDate = new Date('2025-01-15')
      const contactDate = new Date('2025-03-20')

      mockPrisma.batch.findUnique.mockResolvedValue({ id: 1 })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        {
          id: 1,
          transactionType: 'cancellation',
          effectiveDate: batchDetailDate,
          cancelReasonCode: '14',
          contact: {
            careEndDate: contactDate,
            cancelReasonCode: '21',
          },
        },
      ])

      const results = await service.findBatchContacts(1)

      expect(results[0].effectiveDate).toBe(batchDetailDate.toISOString().split('T')[0])
      expect(results[0].cancelReasonCode).toBe('14')
      expect(results[0].cancelReasonLabel).toBe('Child Died')
    })

    it('should use batch detail snapshot values for cancellation transactions', async () => {
      const batchDetailDate = new Date('2025-03-20')

      mockPrisma.batch.findUnique.mockResolvedValue({ id: 1 })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        {
          id: 1,
          transactionType: 'cancellation',
          effectiveDate: batchDetailDate,
          cancelReasonCode: '21',
          contact: {
            careEndDate: null,
            cancelReasonCode: null,
          },
        },
      ])

      const results = await service.findBatchContacts(1)

      expect(results[0].effectiveDate).toBe(batchDetailDate.toISOString().split('T')[0])
      expect(results[0].cancelReasonCode).toBe('21')
      expect(results[0].cancelReasonLabel).toBe('Child Left')
    })

    it('should use batch detail effectiveDate for application transactions', async () => {
      const batchDetailDate = new Date('2025-01-15')
      const contactDate = new Date('2025-03-20')

      mockPrisma.batch.findUnique.mockResolvedValue({ id: 1 })
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([
        {
          id: 1,
          transactionType: 'application',
          effectiveDate: batchDetailDate,
          cancelReasonCode: null,
          contact: {
            effectiveDate: contactDate,
            careEndDate: null,
            cancelReasonCode: null,
          },
        },
      ])

      const results = await service.findBatchContacts(1)

      expect(results[0].effectiveDate).toBe(batchDetailDate.toISOString().split('T')[0])
      expect(results[0].cancelReasonCode).toBeNull()
      expect(results[0].cancelReasonLabel).toBeNull()
    })
  })

  describe('addContactsToPendingBatch - User Story 39432', () => {
    it('should capture effectiveDate and cancelReasonCode snapshots for cancellation batches', async () => {
      const contact = {
        id: 1,
        caseNumber: 'CASE-1',
        csaStatus: 'not_eligible_in_pay',
        effectiveDate: new Date('2024-01-01'),
        careEndDate: new Date('2025-02-20'),
        cancelReasonCode: '14',
      }

      mockPrisma.batch.findFirst.mockResolvedValue({ id: 1, status: 'pending' })
      mockPrisma.contact.findMany.mockResolvedValue([contact])
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([])
      mockContactsService.updateCsaStatus.mockResolvedValue({
        success: true,
        to: 'in_batch_cancellation',
      })
      mockPrisma.contactBatchDetail.create.mockResolvedValue({ id: 10 })
      mockPrisma.contactBatchDetail.update.mockResolvedValue({})
      mockPrisma.batch.update.mockResolvedValue({})

      await service.addContactsToPendingBatch([1], 'user@test.com')

      expect(mockPrisma.contactBatchDetail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          effectiveDate: new Date('2025-02-20'), // careEndDate for cancellations
          cancelReasonCode: '14',
          transactionType: 'cancellation',
        }),
      })
    })

    it('should capture effectiveDate and null cancelReasonCode for application batches', async () => {
      const contact = {
        id: 2,
        caseNumber: 'CASE-2',
        csaStatus: 'eligible',
        effectiveDate: new Date('2025-01-15'),
        careEndDate: null,
        cancelReasonCode: null,
      }

      mockPrisma.batch.findFirst.mockResolvedValue({ id: 1, status: 'pending' })
      mockPrisma.contact.findMany.mockResolvedValue([contact])
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([])
      mockContactsService.updateCsaStatus.mockResolvedValue({
        success: true,
        to: 'in_batch_application',
      })
      mockPrisma.contactBatchDetail.create.mockResolvedValue({ id: 11 })
      mockPrisma.contactBatchDetail.update.mockResolvedValue({})
      mockPrisma.batch.update.mockResolvedValue({})

      await service.addContactsToPendingBatch([2], 'user@test.com')

      expect(mockPrisma.contactBatchDetail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          effectiveDate: new Date('2025-01-15'), // effectiveDate for applications
          cancelReasonCode: null,
          transactionType: 'application',
        }),
      })
    })

    it('should apply default values for cancellation when blank and capture them', async () => {
      const contact = {
        id: 3,
        caseNumber: 'CASE-3',
        csaStatus: 'not_eligible_in_pay',
        effectiveDate: new Date('2024-01-01'),
        careEndDate: null,
        cancelReasonCode: null,
      }

      mockPrisma.batch.findFirst.mockResolvedValue({ id: 1, status: 'pending' })
      mockPrisma.contact.findMany.mockResolvedValue([contact])
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([])
      mockContactsService.updateCsaStatus.mockResolvedValue({
        success: true,
        to: 'in_batch_cancellation',
      })
      mockPrisma.contactBatchDetail.create.mockResolvedValue({ id: 12 })
      mockPrisma.contactBatchDetail.update.mockResolvedValue({})
      mockPrisma.batch.update.mockResolvedValue({})

      await service.addContactsToPendingBatch([3], 'user@test.com')

      // Verify defaults were captured in batch detail (contacts table is not updated)
      expect(mockPrisma.contactBatchDetail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          effectiveDate: expect.any(Date), // careEndDate was null, so defaults to current date
          cancelReasonCode: '21', // defaults to CHILD_LEFT
        }),
      })
    })
  })
})
