import { TRANSACTION_TYPES } from 'src/api/contacts/constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackfillBatchEffectiveDateReasonHandler } from './backfill-batch-effective-date-reason.handler'

describe('BackfillBatchEffectiveDateReasonHandler', () => {
  let handler: BackfillBatchEffectiveDateReasonHandler
  let mockPrisma: any

  beforeEach(() => {
    mockPrisma = {
      contactBatchDetail: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
    }

    handler = new BackfillBatchEffectiveDateReasonHandler(mockPrisma)
  })

  describe('execute', () => {
    it('should return success when no batch details need backfilling', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([])

      const result = await handler.execute({} as any)

      expect(result.success).toBe(true)
      expect(result.message).toBe('No batch details to backfill')
      expect(result.metadata?.recordsProcessed).toBe(0)
      expect(mockPrisma.contactBatchDetail.update).not.toHaveBeenCalled()
    })

    it('should backfill application batch details with effectiveDate from contact', async () => {
      const effectiveDate = new Date('2025-01-15')
      const batchDetails = [
        {
          id: 1,
          transactionType: TRANSACTION_TYPES.APPLICATION,
          contact: {
            effectiveDate,
            careEndDate: null,
            cancelReasonCode: null,
          },
        },
      ]

      mockPrisma.contactBatchDetail.findMany.mockResolvedValue(batchDetails)
      mockPrisma.contactBatchDetail.update.mockResolvedValue({})

      const result = await handler.execute({} as any)

      expect(result.success).toBe(true)
      expect(result.metadata?.updated).toBe(1)
      expect(result.metadata?.skipped).toBe(0)
      expect(mockPrisma.contactBatchDetail.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          effectiveDate,
          cancelReasonCode: null,
        },
      })
    })

    it('should backfill cancellation batch details with careEndDate and cancelReasonCode from contact', async () => {
      const careEndDate = new Date('2025-02-20')
      const batchDetails = [
        {
          id: 2,
          transactionType: TRANSACTION_TYPES.CANCELLATION,
          contact: {
            effectiveDate: new Date('2024-01-01'),
            careEndDate,
            cancelReasonCode: '14',
          },
        },
      ]

      mockPrisma.contactBatchDetail.findMany.mockResolvedValue(batchDetails)
      mockPrisma.contactBatchDetail.update.mockResolvedValue({})

      const result = await handler.execute({} as any)

      expect(result.success).toBe(true)
      expect(result.metadata?.updated).toBe(1)
      expect(mockPrisma.contactBatchDetail.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: {
          effectiveDate: careEndDate,
          cancelReasonCode: '14',
        },
      })
    })

    it('should backfill multiple batch details', async () => {
      const batchDetails = [
        {
          id: 1,
          transactionType: TRANSACTION_TYPES.APPLICATION,
          contact: {
            effectiveDate: new Date('2025-01-15'),
            careEndDate: null,
            cancelReasonCode: null,
          },
        },
        {
          id: 2,
          transactionType: TRANSACTION_TYPES.CANCELLATION,
          contact: {
            effectiveDate: new Date('2024-01-01'),
            careEndDate: new Date('2025-02-20'),
            cancelReasonCode: '21',
          },
        },
        {
          id: 3,
          transactionType: TRANSACTION_TYPES.APPLICATION,
          contact: {
            effectiveDate: new Date('2025-03-10'),
            careEndDate: null,
            cancelReasonCode: null,
          },
        },
      ]

      mockPrisma.contactBatchDetail.findMany.mockResolvedValue(batchDetails)
      mockPrisma.contactBatchDetail.update.mockResolvedValue({})

      const result = await handler.execute({} as any)

      expect(result.success).toBe(true)
      expect(result.metadata?.updated).toBe(3)
      expect(result.metadata?.skipped).toBe(0)
      expect(mockPrisma.contactBatchDetail.update).toHaveBeenCalledTimes(3)
    })

    it('should apply default values when contact fields are null', async () => {
      const batchDetails = [
        {
          id: 1,
          transactionType: TRANSACTION_TYPES.APPLICATION,
          contact: {
            effectiveDate: null,
            careEndDate: null,
            cancelReasonCode: null,
          },
        },
        {
          id: 2,
          transactionType: TRANSACTION_TYPES.CANCELLATION,
          contact: {
            effectiveDate: new Date('2024-01-01'),
            careEndDate: null,
            cancelReasonCode: null,
          },
        },
      ]

      mockPrisma.contactBatchDetail.findMany.mockResolvedValue(batchDetails)
      mockPrisma.contactBatchDetail.update.mockResolvedValue({})

      const result = await handler.execute({} as any)

      expect(result.success).toBe(true)
      expect(result.metadata?.updated).toBe(2)

      // For application with null effectiveDate, defaults to current date
      expect(mockPrisma.contactBatchDetail.update).toHaveBeenNthCalledWith(1, {
        where: { id: 1 },
        data: {
          effectiveDate: expect.any(Date), // Defaults to current date
          cancelReasonCode: null,
        },
      })

      // For cancellation with null careEndDate and cancelReasonCode, defaults both
      expect(mockPrisma.contactBatchDetail.update).toHaveBeenNthCalledWith(2, {
        where: { id: 2 },
        data: {
          effectiveDate: expect.any(Date), // careEndDate was null, defaults to current date
          cancelReasonCode: '21', // Defaults to CHILD_LEFT
        },
      })
    })

    it('should continue processing after error and count skipped records', async () => {
      const batchDetails = [
        {
          id: 1,
          transactionType: TRANSACTION_TYPES.APPLICATION,
          contact: {
            effectiveDate: new Date('2025-01-15'),
            careEndDate: null,
            cancelReasonCode: null,
          },
        },
        {
          id: 2,
          transactionType: TRANSACTION_TYPES.CANCELLATION,
          contact: {
            effectiveDate: new Date('2024-01-01'),
            careEndDate: new Date('2025-02-20'),
            cancelReasonCode: '21',
          },
        },
      ]

      mockPrisma.contactBatchDetail.findMany.mockResolvedValue(batchDetails)
      mockPrisma.contactBatchDetail.update
        .mockResolvedValueOnce({}) // First succeeds
        .mockRejectedValueOnce(new Error('Database error')) // Second fails

      const result = await handler.execute({} as any)

      expect(result.success).toBe(true)
      expect(result.metadata?.updated).toBe(1)
      expect(result.metadata?.skipped).toBe(1)
      expect(result.metadata?.recordsProcessed).toBe(2)
    })

    it('should query only batch details where effectiveDate is null', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([])

      await handler.execute({} as any)

      expect(mockPrisma.contactBatchDetail.findMany).toHaveBeenCalledWith({
        where: {
          effectiveDate: null,
        },
        include: {
          contact: {
            select: {
              effectiveDate: true,
              careEndDate: true,
              cancelReasonCode: true,
            },
          },
        },
      })
    })
  })
})
