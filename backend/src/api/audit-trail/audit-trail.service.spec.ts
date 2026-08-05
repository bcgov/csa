import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from 'src/common/database/prisma.service'
import { AuditTrailService } from './audit-trail.service'

describe('AuditTrailService', () => {
  let service: AuditTrailService
  const mockPrisma = {
    contact: { findUnique: vi.fn() },
    contactAuditTrail: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditTrailService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile()

    service = module.get(AuditTrailService)
  })

  it('should return paginated audit trail ordered by actioned_at desc', async () => {
    const row = {
      id: 1,
      contactId: 5,
      actionedAt: new Date('2026-06-01T12:00:00Z'),
      actionedBy: 'SYSTEM',
      operation: 'new',
      field: null,
      oldValue: null,
      newValue: null,
    }
    mockPrisma.contactAuditTrail.findMany.mockResolvedValue([row])
    mockPrisma.contactAuditTrail.count.mockResolvedValue(1)

    const result = await service.findAll(1, 10)

    expect(mockPrisma.contactAuditTrail.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ actionedAt: 'desc' }, { id: 'asc' }],
      skip: 0,
      take: 10,
    })
    expect(result.total).toBe(1)
    expect(result.data[0].operation).toBe('New')
  })

  it('should filter by contactId when provided', async () => {
    mockPrisma.contactAuditTrail.findMany.mockResolvedValue([])
    mockPrisma.contactAuditTrail.count.mockResolvedValue(0)

    await service.findAll(1, 10, 42)

    expect(mockPrisma.contactAuditTrail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contactId: 42 } }),
    )
  })

  it('should throw NotFoundException when contact does not exist', async () => {
    mockPrisma.contact.findUnique.mockResolvedValue(null)

    await expect(service.findByContactId(999)).rejects.toThrow(NotFoundException)
  })
})
