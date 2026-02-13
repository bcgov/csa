import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { EligibilityService } from './eligibility.service'
import { PrismaService } from 'src/common/database/prisma.service'

describe('EligibilityService', () => {
  let service: EligibilityService
  let mockPrisma: {
    $queryRawUnsafe: ReturnType<typeof vi.fn>
    $executeRawUnsafe: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockPrisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [EligibilityService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile()

    service = module.get<EligibilityService>(EligibilityService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should return zero counts when no staging data', async () => {
    const result = await service.run()
    expect(result.processed).toBe(0)
    expect(result.statusChanges).toBe(0)
  })

  it('should process contacts from staging and return stats', async () => {
    // Mock: single query returns contact with pre-aggregated JSON arrays
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        personIdIcm: 'ICM-1',
        firstName: 'John',
        lastName: 'Doe',
        middleName: '',
        dateOfBirth: new Date('2010-06-15'),
        age: 15,
        gender: 'M',
        caseNumber: 'CS-001',
        caseType: 'Child Services',
        caseStatus: 'Open',
        caseLoad: 'CL-1',
        din: null,
        csaSentDate: null,
        misLegalAuthCode: null,
        enrollForCsa: 'Yes',
        legalAuthorityCode: null,
        effectiveLegalStatus: 'Active',
        legalExpiryDate: null,
        existingContactId: null,
        csaStatus: null,
        personIdMis: 'MIS-1',
        isInEligible: false,
        deceased: null,
        akaFirstName: null,
        akaLastName: null,
        legacyFileNumber: null,
        serviceOffice: null,
        assignedTo: null,
        birthCity: null,
        birthProvince: null,
        birthCountry: null,
        effectiveDate: null,
        icmPlacements: [],
        icmOrders: [],
        icmAgreements: [],
        misPayments: [],
        misPlacements: [],
      },
    ])

    const result = await service.run()
    expect(result.processed).toBe(1)
  })
})
