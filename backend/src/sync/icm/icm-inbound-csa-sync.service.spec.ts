import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import { IcmInboundCsaSyncService } from './icm-inbound-csa-sync.service'

describe('IcmInboundCsaSyncService', () => {
  let service: IcmInboundCsaSyncService
  let mockPrisma: {
    $queryRawUnsafe: ReturnType<typeof vi.fn>
    contact: { update: ReturnType<typeof vi.fn> }
  }

  beforeEach(() => {
    mockPrisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      contact: { update: vi.fn().mockResolvedValue({}) },
    }
    service = new IcmInboundCsaSyncService(mockPrisma as never)
  })

  it('should skip when threshold is null (full load)', async () => {
    const result = await service.syncFromStaging(null)

    expect(result).toBeNull()
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled()
  })

  it('should return zero counts when no drift is found', async () => {
    const result = await service.syncFromStaging(new Date('2026-06-01'))

    expect(result).toEqual({ candidates: 0, updated: 0, skipped: 0 })
    expect(mockPrisma.contact.update).not.toHaveBeenCalled()
  })

  it('should apply ICM CSA fields without flagging outbound sync', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      {
        contactId: 42,
        caseNumber: '1-12345',
        currentCsaStatus: 'eligible',
        personIdIcm: 'ICM-WINNER',
        contactIdIcm: 'CONTACT-99',
        din: '123456789',
        csaStatus: 'in_pay',
        csaStatusEffectiveDate: new Date('2026-05-15T07:00:00Z'),
        csaSentDate: new Date('2026-05-10T07:00:00Z'),
      },
    ])

    const result = await service.syncFromStaging(new Date('2026-06-01'))

    expect(result).toEqual({ candidates: 1, updated: 1, skipped: 0 })
    expect(mockPrisma.contact.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        personIdIcm: 'ICM-WINNER',
        contactIdIcm: 'CONTACT-99',
        din: '123456789',
        csaStatus: 'in_pay',
        csaStatusEffectiveDate: new Date('2026-05-15T07:00:00Z'),
        csaSentDate: new Date('2026-05-10T07:00:00Z'),
        lastUpdatedAt: expect.any(Date),
        lastUpdatedBy: 'ICM_INBOUND_SYNC',
      },
    })
    expect(mockPrisma.contact.update.mock.calls[0][0].data).not.toHaveProperty(
      'icmIntegrationStatus',
    )
  })

  it('should not update CSA status or effective date when current status is protected', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      {
        contactId: 7,
        caseNumber: '1-55555',
        currentCsaStatus: 'on_hold',
        personIdIcm: 'ICM-7',
        contactIdIcm: 'CONTACT-7',
        din: '999888777',
        csaStatus: 'in_pay',
        csaStatusEffectiveDate: new Date('2026-05-15T07:00:00Z'),
        csaSentDate: new Date('2026-05-10T07:00:00Z'),
      },
    ])

    const result = await service.syncFromStaging(new Date('2026-06-01'))

    expect(result).toEqual({ candidates: 1, updated: 1, skipped: 0 })
    expect(mockPrisma.contact.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        personIdIcm: 'ICM-7',
        contactIdIcm: 'CONTACT-7',
        din: '999888777',
        csaSentDate: new Date('2026-05-10T07:00:00Z'),
        lastUpdatedAt: expect.any(Date),
        lastUpdatedBy: 'ICM_INBOUND_SYNC',
      },
    })
    expect(mockPrisma.contact.update.mock.calls[0][0].data).not.toHaveProperty('csaStatus')
    expect(mockPrisma.contact.update.mock.calls[0][0].data).not.toHaveProperty(
      'csaStatusEffectiveDate',
    )
  })

  it('should skip and warn when person_id_icm unique constraint fails', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      {
        contactId: 1,
        caseNumber: '1-99999',
        currentCsaStatus: 'eligible',
        personIdIcm: 'ICM-COLLISION',
        contactIdIcm: null,
        din: '123456789',
        csaStatus: 'in_pay',
        csaStatusEffectiveDate: null,
        csaSentDate: null,
      },
    ])
    mockPrisma.contact.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['person_id_icm'] },
      }),
    )

    const result = await service.syncFromStaging(new Date('2026-06-01'))

    expect(result).toEqual({ candidates: 1, updated: 0, skipped: 1 })
  })

  it('should count other failures as skipped', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      {
        contactId: 1,
        caseNumber: '1-88888',
        currentCsaStatus: null,
        personIdIcm: 'A',
        contactIdIcm: null,
        din: null,
        csaStatus: null,
        csaStatusEffectiveDate: null,
        csaSentDate: null,
      },
    ])
    mockPrisma.contact.update.mockRejectedValue(new Error('connection lost'))

    const result = await service.syncFromStaging(new Date('2026-06-01'))

    expect(result).toEqual({ candidates: 1, updated: 0, skipped: 1 })
  })
})
