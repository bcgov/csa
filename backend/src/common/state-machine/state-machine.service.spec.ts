import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import type { Contact } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BATCH_EVENT, BATCH_STATUS, CSA_EVENT, CSA_STATUS } from './constants'
import { StateMachineService } from './state-machine.service'

describe('StateMachineService', () => {
  let service: StateMachineService
  let prisma: PrismaService

  // Partial mock - only includes fields used by tests
  const mockContact = {
    id: 1,
    csaStatus: CSA_STATUS.ELIGIBLE,
    resumeStatus: null,
    holdBy: null,
  } as unknown as Contact

  const mockBatch = {
    id: 1,
    status: BATCH_STATUS.PENDING,
  }

  const mockBatchDetail = {
    id: 1,
    status: 'pending',
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StateMachineService,
        {
          provide: PrismaService,
          useValue: {
            contact: {
              findUnique: vi.fn().mockResolvedValue(mockContact),
              update: vi
                .fn()
                .mockResolvedValue({ ...mockContact, csaStatus: CSA_STATUS.IN_BATCH_APPLICATION }),
            },
            batch: {
              findUnique: vi.fn().mockResolvedValue(mockBatch),
              update: vi.fn().mockResolvedValue({ ...mockBatch, status: BATCH_STATUS.IN_PROGRESS }),
            },
            contactBatchDetail: {
              findUnique: vi.fn().mockResolvedValue(mockBatchDetail),
              update: vi.fn().mockResolvedValue({ ...mockBatchDetail, status: 'in_progress' }),
            },
          },
        },
      ],
    }).compile()

    service = module.get<StateMachineService>(StateMachineService)
    prisma = module.get<PrismaService>(PrismaService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('canTransition', () => {
    it('should return true for valid CSA transition', () => {
      expect(service.canTransition('csaStatus', CSA_STATUS.ELIGIBLE, CSA_EVENT.ADD_TO_BATCH)).toBe(
        true,
      )
    })

    it('should return false for invalid CSA transition', () => {
      expect(service.canTransition('csaStatus', CSA_STATUS.ELIGIBLE, CSA_EVENT.CRA_ACCEPTED)).toBe(
        false,
      )
    })

    it('should return true for valid Batch transition', () => {
      expect(service.canTransition('batch', BATCH_STATUS.PENDING, BATCH_EVENT.SEND_TO_CRA)).toBe(
        true,
      )
    })
  })

  describe('getNextState', () => {
    it('should return next state for valid CSA transition', () => {
      expect(service.getNextState('csaStatus', CSA_STATUS.ELIGIBLE, CSA_EVENT.ADD_TO_BATCH)).toBe(
        CSA_STATUS.IN_BATCH_APPLICATION,
      )
    })

    it('should return current state for invalid transition', () => {
      expect(service.getNextState('csaStatus', CSA_STATUS.ELIGIBLE, CSA_EVENT.CRA_ACCEPTED)).toBe(
        CSA_STATUS.ELIGIBLE,
      )
    })
  })

  describe('getStatusLabel', () => {
    it('should return display label for CSA status', () => {
      expect(service.getStatusLabel('csaStatus', CSA_STATUS.IN_BATCH_APPLICATION)).toBe(
        'In Batch - Application',
      )
    })

    it('should return display label for Batch status', () => {
      expect(service.getStatusLabel('batch', BATCH_STATUS.IN_PROGRESS)).toBe('In Progress')
    })

    it('should return raw value if label not found', () => {
      expect(service.getStatusLabel('csaStatus', 'unknown_status')).toBe('unknown_status')
    })
  })

  describe('transitionContact', () => {
    it('should transition contact and update DB for valid USER event', async () => {
      const result = await service.transitionContact(1, CSA_EVENT.ADD_TO_BATCH, 'USER', 'user123')

      expect(result.success).toBe(true)
      expect(result.from).toBe(CSA_STATUS.ELIGIBLE)
      expect(result.to).toBe(CSA_STATUS.IN_BATCH_APPLICATION)
      expect(prisma.contact.update).toHaveBeenCalled()
    })

    it('should reject USER attempting SYSTEM event', async () => {
      const result = await service.transitionContact(1, CSA_EVENT.SEND_TO_CRA, 'USER', 'user123')

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Event not allowed for users')
      expect(prisma.contact.update).not.toHaveBeenCalled()
    })

    it('should allow SYSTEM to trigger SYSTEM event', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        ...mockContact,
        csaStatus: CSA_STATUS.IN_BATCH_APPLICATION,
      } as unknown as Contact)

      const result = await service.transitionContact(1, CSA_EVENT.SEND_TO_CRA, 'SYSTEM')

      expect(result.success).toBe(true)
    })

    it('should reject invalid transition', async () => {
      const result = await service.transitionContact(1, CSA_EVENT.HOLD, 'USER', 'user123')

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Invalid transition')
    })

    it('should return error if contact not found', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(null)

      const result = await service.transitionContact(999, CSA_EVENT.ADD_TO_BATCH, 'USER', 'user123')

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Contact not found')
    })

    it('should handle HOLD event by saving resume_status', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        ...mockContact,
        csaStatus: CSA_STATUS.ELIGIBLE_TBD,
      } as unknown as Contact)

      await service.transitionContact(1, CSA_EVENT.HOLD, 'USER', 'user123')

      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            csaStatus: CSA_STATUS.ON_HOLD,
            resumeStatus: CSA_STATUS.ELIGIBLE_TBD,
            holdBy: 'user123',
          }),
        }),
      )
    })

    it('should handle RESUME event by restoring resume_status', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        ...mockContact,
        csaStatus: CSA_STATUS.ON_HOLD,
        resumeStatus: CSA_STATUS.ELIGIBLE_TBD,
      } as unknown as Contact)

      const result = await service.transitionContact(1, CSA_EVENT.RESUME, 'USER', 'user123')

      expect(result.success).toBe(true)
      expect(result.to).toBe(CSA_STATUS.ELIGIBLE_TBD)
      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            csaStatus: CSA_STATUS.ELIGIBLE_TBD,
            resumeStatus: null,
            holdBy: null,
          }),
        }),
      )
    })

    it('should reject RESUME if no resume_status available', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        ...mockContact,
        csaStatus: CSA_STATUS.ON_HOLD,
        resumeStatus: null,
      } as unknown as Contact)

      const result = await service.transitionContact(1, CSA_EVENT.RESUME, 'USER', 'user123')

      expect(result.success).toBe(false)
      expect(result.reason).toBe('No resume status available')
    })
  })

  describe('transitionBatch', () => {
    it('should transition batch and update DB', async () => {
      const result = await service.transitionBatch(1, BATCH_EVENT.SEND_TO_CRA, 'SYSTEM')

      expect(result.success).toBe(true)
      expect(result.from).toBe(BATCH_STATUS.PENDING)
      expect(result.to).toBe(BATCH_STATUS.IN_PROGRESS)
    })

    it('should return error if batch not found', async () => {
      vi.spyOn(prisma.batch, 'findUnique').mockResolvedValue(null)

      const result = await service.transitionBatch(999, BATCH_EVENT.SEND_TO_CRA, 'SYSTEM')

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Batch not found')
    })
  })

  describe('transitionContacts (bulk)', () => {
    it('should transition multiple contacts', async () => {
      const result = await service.transitionContacts(
        [1, 2, 3],
        CSA_EVENT.ADD_TO_BATCH,
        'USER',
        'user123',
      )

      expect(result.succeeded).toHaveLength(3)
      expect(result.failed).toHaveLength(0)
    })

    it('should handle partial failures', async () => {
      vi.spyOn(prisma.contact, 'findUnique')
        .mockResolvedValueOnce(mockContact as unknown as Contact)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockContact as unknown as Contact)

      const result = await service.transitionContacts(
        [1, 2, 3],
        CSA_EVENT.ADD_TO_BATCH,
        'USER',
        'user123',
      )

      expect(result.succeeded).toHaveLength(2)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0].id).toBe(2)
    })
  })
})
