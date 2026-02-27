import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from 'src/common/database/prisma.service'
import { IcmDataSource } from './data-source/icm-data-source'
import { IcmSyncBackService } from './icm-sync-back.service'

const makeContact = (id: number, overrides = {}) => ({
  id,
  personIdIcm: `ICM-${id}`,
  csaStatus: 'eligible',
  csaStatusEffectiveDate: new Date('2026-01-15T20:00:00Z'), // Jan 15 12:00 PST
  din: `DIN-${id}`,
  csaSentDate: null,
  ...overrides,
})

describe('IcmSyncBackService', () => {
  let service: IcmSyncBackService
  let prisma: {
    contact: {
      findMany: ReturnType<typeof vi.fn>
      findUnique: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      updateMany: ReturnType<typeof vi.fn>
    }
  }
  let icmDataSource: {
    fetchAll: ReturnType<typeof vi.fn>
    updateContacts: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    prisma = {
      contact: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    }

    icmDataSource = {
      fetchAll: vi.fn(),
      updateContacts: vi.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IcmSyncBackService,
        { provide: PrismaService, useValue: prisma },
        { provide: IcmDataSource, useValue: icmDataSource },
      ],
    }).compile()

    service = module.get(IcmSyncBackService)
  })

  describe('syncFlaggedContacts', () => {
    it('should return zeros when no contacts are flagged', async () => {
      const result = await service.syncFlaggedContacts()

      expect(result).toEqual({ totalFlagged: 0, synced: 0, failed: 0, chunks: 0 })
      expect(icmDataSource.updateContacts).not.toHaveBeenCalled()
    })

    it('should sync a single chunk and clear flags', async () => {
      const contacts = [makeContact(1), makeContact(2)]
      prisma.contact.findMany.mockResolvedValue(contacts)

      const result = await service.syncFlaggedContacts()

      expect(result).toEqual({ totalFlagged: 2, synced: 2, failed: 0, chunks: 1 })
      expect(icmDataSource.updateContacts).toHaveBeenCalledTimes(1)
      expect(icmDataSource.updateContacts).toHaveBeenCalledWith([
        expect.objectContaining({ Id: 'ICM-1', 'CSA Status': 'Eligible' }),
        expect.objectContaining({ Id: 'ICM-2', 'CSA Status': 'Eligible' }),
      ])
      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        data: { icmIntegrationStatus: false },
      })
    })

    it('should split into chunks of 100', async () => {
      const contacts = Array.from({ length: 150 }, (_, i) => makeContact(i + 1))
      prisma.contact.findMany.mockResolvedValue(contacts)

      const result = await service.syncFlaggedContacts()

      expect(result).toEqual({ totalFlagged: 150, synced: 150, failed: 0, chunks: 2 })
      expect(icmDataSource.updateContacts).toHaveBeenCalledTimes(2)
      expect(icmDataSource.updateContacts.mock.calls[0][0]).toHaveLength(100)
      expect(icmDataSource.updateContacts.mock.calls[1][0]).toHaveLength(50)
    })

    it('should report failed count when chunk fails', async () => {
      const contacts = [makeContact(1), makeContact(2)]
      prisma.contact.findMany.mockResolvedValue(contacts)
      icmDataSource.updateContacts.mockRejectedValue(new Error('ICM down'))

      const result = await service.syncFlaggedContacts()

      expect(result).toEqual({ totalFlagged: 2, synced: 0, failed: 2, chunks: 1 })
      expect(prisma.contact.updateMany).not.toHaveBeenCalled()
    })

    it('should handle partial failure across chunks', async () => {
      const contacts = Array.from({ length: 150 }, (_, i) => makeContact(i + 1))
      prisma.contact.findMany.mockResolvedValue(contacts)
      icmDataSource.updateContacts
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ICM down'))

      const result = await service.syncFlaggedContacts()

      expect(result).toEqual({ totalFlagged: 150, synced: 100, failed: 50, chunks: 2 })
      expect(prisma.contact.updateMany).toHaveBeenCalledTimes(1)
    })

    it('should format dates as MM/DD/YYYY HH:MM:SS in PST in payload', async () => {
      const contacts = [
        makeContact(1, {
          // Jun 20 17:30:45 UTC = Jun 20 10:30:45 PDT (UTC-7 in summer)
          csaStatusEffectiveDate: new Date('2026-06-20T17:30:45Z'),
          // Mar 10 21:15:00 UTC = Mar 10 14:15:00 PDT (UTC-7 after spring-forward)
          csaSentDate: new Date('2026-03-10T21:15:00Z'),
        }),
      ]
      prisma.contact.findMany.mockResolvedValue(contacts)

      await service.syncFlaggedContacts()

      expect(icmDataSource.updateContacts).toHaveBeenCalledWith([
        expect.objectContaining({
          'CSA Status Effective Date': '06/20/2026 10:30:45',
          'CSA Sent Date': '03/10/2026 14:15:00',
        }),
      ])
    })
  })

  describe('syncSingleContact', () => {
    it('should sync contact and clear flag on success', async () => {
      prisma.contact.findUnique.mockResolvedValue(makeContact(1))

      const result = await service.syncSingleContact(1)

      expect(result).toBe(true)
      expect(icmDataSource.updateContacts).toHaveBeenCalledWith([
        expect.objectContaining({ Id: 'ICM-1' }),
      ])
      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { icmIntegrationStatus: false },
      })
    })

    it('should return false and leave flag on failure', async () => {
      prisma.contact.findUnique.mockResolvedValue(makeContact(1))
      icmDataSource.updateContacts.mockRejectedValue(new Error('ICM down'))

      const result = await service.syncSingleContact(1)

      expect(result).toBe(false)
      expect(prisma.contact.update).not.toHaveBeenCalled()
    })

    it('should return false when contact not found', async () => {
      prisma.contact.findUnique.mockResolvedValue(null)

      const result = await service.syncSingleContact(999)

      expect(result).toBe(false)
      expect(icmDataSource.updateContacts).not.toHaveBeenCalled()
    })
  })
})
