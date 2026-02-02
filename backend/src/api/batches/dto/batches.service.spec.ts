import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from 'src/common/database/prisma.service'
import { BATCH_STATUSES } from '../../contacts/constants'
import { BatchesService } from '../batches.service'

describe('BatchesService', () => {
  let service: BatchesService

  const mockPrismaService = {
    batch: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contactBatchDetail: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    contact: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BatchesService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile()

    service = module.get<BatchesService>(BatchesService)
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('findAll', () => {
    it('should return all batches ordered by createdAt desc', async () => {
      const batches = [
        { id: 2, status: 'pending', createdAt: new Date('2026-01-29') },
        { id: 1, status: 'processed', createdAt: new Date('2026-01-28') },
      ]
      mockPrismaService.batch.findMany.mockResolvedValue(batches)

      const result = await service.findAll()

      expect(result).toEqual(batches)
      expect(mockPrismaService.batch.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('findOne', () => {
    it('should return a batch by id', async () => {
      const batch = { id: 1, status: 'pending', createdAt: new Date() }
      mockPrismaService.batch.findUnique.mockResolvedValue(batch)

      const result = await service.findOne(1)

      expect(result).toEqual(batch)
      expect(mockPrismaService.batch.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      })
    })

    it('should throw NotFoundException if batch not found', async () => {
      mockPrismaService.batch.findUnique.mockResolvedValue(null)

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException)
      await expect(service.findOne(999)).rejects.toThrow('Batch 999 not found')
    })
  })

  describe('findBatchContacts', () => {
    it('should return contacts in a batch', async () => {
      const batch = { id: 1, status: 'pending' }
      const details = [
        {
          id: 1,
          contactId: 100,
          batchId: 1,
          contact: {
            id: 100,
            lastName: 'Doe',
            firstName: 'John',
            din: '123',
            csaStatus: 'eligible',
          },
        },
      ]
      mockPrismaService.batch.findUnique.mockResolvedValue(batch)
      mockPrismaService.contactBatchDetail.findMany.mockResolvedValue(details)

      const result = await service.findBatchContacts(1)

      expect(result).toEqual(details)
      expect(mockPrismaService.contactBatchDetail.findMany).toHaveBeenCalledWith({
        where: { batchId: 1 },
        include: {
          contact: {
            select: {
              id: true,
              lastName: true,
              firstName: true,
              din: true,
              csaStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    })

    it('should throw NotFoundException if batch not found', async () => {
      mockPrismaService.batch.findUnique.mockResolvedValue(null)

      await expect(service.findBatchContacts(999)).rejects.toThrow(NotFoundException)
    })
  })

  describe('findOrCreatePendingBatch', () => {
    it('should return existing pending batch', async () => {
      const pendingBatch = { id: 1, status: BATCH_STATUSES.PENDING }
      mockPrismaService.batch.findFirst.mockResolvedValue(pendingBatch)

      const result = await service.findOrCreatePendingBatch()

      expect(result).toEqual(pendingBatch)
      expect(mockPrismaService.batch.findFirst).toHaveBeenCalledWith({
        where: { status: BATCH_STATUSES.PENDING },
      })
      expect(mockPrismaService.batch.create).not.toHaveBeenCalled()
    })

    it('should create new pending batch if none exists', async () => {
      const newBatch = { id: 1, status: BATCH_STATUSES.PENDING, recordCount: 0 }
      mockPrismaService.batch.findFirst.mockResolvedValue(null)
      mockPrismaService.batch.create.mockResolvedValue(newBatch)

      const result = await service.findOrCreatePendingBatch()

      expect(result).toEqual(newBatch)
      expect(mockPrismaService.batch.create).toHaveBeenCalledWith({
        data: {
          batchDate: null,
          status: BATCH_STATUSES.PENDING,
          recordCount: 0,
          createdAt: expect.any(Date),
        },
      })
    })
  })

  describe('addContactsToPendingBatch', () => {
    it('should add contacts to pending batch', async () => {
      const pendingBatch = { id: 1, status: BATCH_STATUSES.PENDING, recordCount: 0 }
      const updatedBatch = { ...pendingBatch, recordCount: 2 }

      vi.spyOn(service, 'findOrCreatePendingBatch').mockResolvedValue(pendingBatch as any)

      mockPrismaService.contact.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }])

      mockPrismaService.contactBatchDetail.findMany.mockResolvedValue([])

      mockPrismaService.contactBatchDetail.create.mockResolvedValue({})

      mockPrismaService.batch.update.mockResolvedValue(updatedBatch)

      const result = await service.addContactsToPendingBatch([1, 2, 999], 'user1')

      expect(result.success).toEqual([1, 2])
      expect(result.skipped).toEqual([{ id: 999, reason: 'not_found' }])
      expect(result.batch.recordCount).toBe(2)
    })

    it('should skip contacts already in batch', async () => {
      const pendingBatch = { id: 1, status: BATCH_STATUSES.PENDING, recordCount: 1 }

      vi.spyOn(service, 'findOrCreatePendingBatch').mockResolvedValue(pendingBatch as any)
      mockPrismaService.contact.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
      mockPrismaService.contactBatchDetail.findMany.mockResolvedValue([{ contactId: 1 }])
      mockPrismaService.contactBatchDetail.create.mockResolvedValue({})
      mockPrismaService.batch.update.mockResolvedValue({ ...pendingBatch, recordCount: 2 })

      const result = await service.addContactsToPendingBatch([1, 2], 'user1')

      expect(result.success).toEqual([2])
      expect(result.skipped).toEqual([{ id: 1, reason: 'already_in_batch' }])
    })
  })

  describe('removeContactFromPendingBatch', () => {
    it('should remove contact from pending batch', async () => {
      const pendingBatch = { id: 1, status: BATCH_STATUSES.PENDING }
      const detail = { id: 10, contactId: 100, batchId: 1 }

      mockPrismaService.batch.findFirst.mockResolvedValue(pendingBatch)
      mockPrismaService.contactBatchDetail.findFirst.mockResolvedValue(detail)
      mockPrismaService.$transaction.mockResolvedValue([])

      await expect(service.removeContactFromPendingBatch(100)).resolves.toBeUndefined()
    })

    it('should throw NotFoundException if no pending batch', async () => {
      mockPrismaService.batch.findFirst.mockResolvedValue(null)

      await expect(service.removeContactFromPendingBatch(100)).rejects.toThrow(NotFoundException)
      await expect(service.removeContactFromPendingBatch(100)).rejects.toThrow(
        'No pending batch exists',
      )
    })

    it('should throw NotFoundException if contact not in batch', async () => {
      const pendingBatch = { id: 1, status: BATCH_STATUSES.PENDING }
      mockPrismaService.batch.findFirst.mockResolvedValue(pendingBatch)
      mockPrismaService.contactBatchDetail.findFirst.mockResolvedValue(null)

      await expect(service.removeContactFromPendingBatch(100)).rejects.toThrow(NotFoundException)
      await expect(service.removeContactFromPendingBatch(100)).rejects.toThrow(
        'Contact 100 not found in pending batch',
      )
    })
  })
})
