import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { EligibilityService } from './eligibility.service'
import { PrismaService } from 'src/common/database/prisma.service'
import { JobsService } from 'src/jobs/jobs.service'
import { buildLoadContactProfilesSql } from './eligibility.queries'

describe('EligibilityService', () => {
  let service: EligibilityService
  let mockPrisma: {
    $queryRawUnsafe: ReturnType<typeof vi.fn>
    $executeRawUnsafe: ReturnType<typeof vi.fn>
  }
  let mockJobsService: { getLastSuccessTimestamp: ReturnType<typeof vi.fn> }
  let mockConfigService: { get: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockPrisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    }

    mockJobsService = {
      getLastSuccessTimestamp: vi.fn().mockResolvedValue(null), // default: full load
    }

    mockConfigService = {
      get: vi.fn().mockReturnValue(2), // lookback days
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EligibilityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JobsService, useValue: mockJobsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
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
        caseRowId: 'CASE-1',
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

  // Helper to build a valid over-18 contact that triggers step10 (newStatus = 'over_18')
  function makeOver18Contact(overrides: Record<string, unknown> = {}) {
    return {
      caseRowId: 'CASE-1',
      personIdIcm: 'ICM-1',
      firstName: 'John',
      lastName: 'Doe',
      middleName: '',
      dateOfBirth: new Date('2000-01-01'),
      age: 26,
      gender: 'M',
      caseNumber: 'CS-001',
      caseType: 'Child Services',
      caseStatus: 'Open',
      caseLoad: 'CL-1',
      din: null,
      csaSentDate: null,
      misLegalAuthCode: null,
      enrollForCsa: null,
      legalAuthorityCode: null,
      effectiveLegalStatus: null,
      legalExpiryDate: null,
      existingContactId: null,
      csaStatus: 'eligible',
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
      ...overrides,
    }
  }

  it('should skip contacts with null required fields and log warning', async () => {
    const logSpy = vi.spyOn(service['logger'], 'warn')

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([makeOver18Contact({ personIdIcm: null })])

    const result = await service.run()

    expect(result.statusChanges).toBe(1) // eligibility still determined a change
    expect(result.skipped).toBe(1)
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('empty/null in required fields'))
  })

  it('should skip invalid contacts and upsert valid ones in same batch', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      makeOver18Contact({ personIdIcm: 'ICM-VALID' }),
      makeOver18Contact({ personIdIcm: null }), // invalid: null person_id_icm
    ])

    const result = await service.run()

    expect(result.statusChanges).toBe(2)
    expect(result.skipped).toBe(1)
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1) // only the valid one
  })

  it('should report caseRowId and null fields in the warning', async () => {
    const logSpy = vi.spyOn(service['logger'], 'warn')

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([makeOver18Contact({ personIdIcm: null })])

    await service.run()

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('caseRowId=CASE-1'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('person_id_icm'))
  })

  it('should upsert protected contacts with existing csa_status preserved', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      makeOver18Contact({ personIdIcm: 'ICM-HOLD', csaStatus: 'on_hold', existingContactId: 99 }),
    ])

    const result = await service.run()

    expect(result.processed).toBe(1)
    expect(result.statusChanges).toBe(0) // no eligibility-driven status change
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1) // still upserted
  })

  it('should preserve protected status and run eligibility for others in same batch', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      makeOver18Contact({ personIdIcm: 'ICM-HOLD', csaStatus: 'on_hold', existingContactId: 99 }),
      makeOver18Contact({ personIdIcm: 'ICM-ELIG', csaStatus: 'eligible' }),
    ])

    const result = await service.run()

    expect(result.processed).toBe(2)
    expect(result.statusChanges).toBe(1) // only the eligible one triggers a change
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1) // both upserted in one batch
  })

  it('should pass threshold to query when last success exists', async () => {
    const lastSuccess = new Date('2026-02-14T10:00:00Z')
    mockJobsService.getLastSuccessTimestamp.mockResolvedValue(lastSuccess)

    await service.run()

    const expectedThreshold = new Date(lastSuccess.getTime() - 2 * 24 * 60 * 60 * 1000)
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('changed_contacts'),
      expectedThreshold,
    )
  })

  it('should use full load when no previous success', async () => {
    mockJobsService.getLastSuccessTimestamp.mockResolvedValue(null)

    await service.run()

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.not.stringContaining('changed_contacts'),
    )
  })

  // -- Auto-batch tests --

  // Helper: contact that reaches step 7 → eligible (under 18, valid placement + order)
  function makeEligibleContact(overrides: Record<string, unknown> = {}) {
    const prevMonth = new Date()
    prevMonth.setMonth(prevMonth.getMonth() - 1)
    return {
      caseRowId: 'CASE-E',
      personIdIcm: 'ICM-ELIG',
      firstName: 'Jane',
      lastName: 'Smith',
      middleName: '',
      dateOfBirth: new Date('2010-06-15'),
      age: 15,
      gender: 'F',
      caseNumber: 'CS-002',
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
      personIdMis: 'MIS-E',
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
      icmPlacements: [
        {
          type: 'Placement',
          status: 'Active',
          startDate: '2024-01-01',
          endDate: null,
          contractNumber: 'C-123',
          agreementRowId: 'AGR-1',
          paidUnpaid: 'Paid',
          placementNumber: 'PL-1',
          serviceType: 'Foster Care',
          serviceProviderName: 'Provider A',
          providerId: 'PROV-1',
          placeOfServiceName: 'Home A',
          interruptedPlacementId: null,
        },
      ],
      icmOrders: [
        {
          orderType: 'Monthly Family Care Rate',
          orderStatus: 'Closed',
          effectiveStartDate: prevMonth.toISOString(),
          amount: 1600,
          contractNumber: 'C-123',
          orderNumber: 'ORD-1',
          product: 'Care',
          agreementRowId: 'AGR-1',
        },
      ],
      icmAgreements: [],
      misPayments: [],
      misPlacements: [],
      ...overrides,
    }
  }

  // Helper: in_pay contact that triggers step 9 → not_eligible_in_pay (deceased)
  function makeInPayCancelContact(overrides: Record<string, unknown> = {}) {
    return {
      caseRowId: 'CASE-C',
      personIdIcm: 'ICM-CANCEL',
      firstName: 'Bob',
      lastName: 'Jones',
      middleName: '',
      dateOfBirth: new Date('2010-06-15'),
      age: 15,
      gender: 'M',
      caseNumber: 'CS-003',
      caseType: 'Child Services',
      caseStatus: 'Open',
      caseLoad: 'CL-1',
      din: null,
      csaSentDate: null,
      misLegalAuthCode: null,
      enrollForCsa: null,
      legalAuthorityCode: null,
      effectiveLegalStatus: null,
      legalExpiryDate: null,
      existingContactId: 50,
      csaStatus: 'in_pay',
      personIdMis: 'MIS-C',
      isInEligible: false,
      deceased: 'Y',
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
      ...overrides,
    }
  }

  it('should auto-batch eligible contacts as application', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([makeEligibleContact()]) // loadContactProfiles
      .mockResolvedValueOnce([{ id: 1, person_id_icm: 'ICM-ELIG' }]) // get contact DB IDs
      .mockResolvedValueOnce([{ id: 100 }]) // find pending batch
      .mockResolvedValueOnce([]) // check already in batch

    mockPrisma.$executeRawUnsafe
      .mockResolvedValueOnce(0) // batchUpsertRows
      .mockResolvedValueOnce(1) // insert batch details
      .mockResolvedValueOnce(1) // update application contacts status
      .mockResolvedValueOnce(1) // update batch record count

    const result = await service.run()

    expect(result.autoBatched.application).toBe(1)
    expect(result.autoBatched.cancellation).toBe(0)
  })

  it('should auto-batch not_eligible_in_pay contacts as cancellation', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([makeInPayCancelContact()]) // loadContactProfiles
      .mockResolvedValueOnce([{ id: 2, person_id_icm: 'ICM-CANCEL' }]) // get contact DB IDs
      .mockResolvedValueOnce([{ id: 100 }]) // find pending batch
      .mockResolvedValueOnce([]) // check already in batch

    mockPrisma.$executeRawUnsafe
      .mockResolvedValueOnce(0) // batchUpsertRows
      .mockResolvedValueOnce(1) // insert batch details
      .mockResolvedValueOnce(1) // update cancellation contacts status
      .mockResolvedValueOnce(1) // update batch record count

    const result = await service.run()

    expect(result.autoBatched.application).toBe(0)
    expect(result.autoBatched.cancellation).toBe(1)
  })

  it('should create pending batch when none exists', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([makeEligibleContact()]) // loadContactProfiles
      .mockResolvedValueOnce([{ id: 1, person_id_icm: 'ICM-ELIG' }]) // get contact DB IDs
      .mockResolvedValueOnce([]) // find pending batch → none
      .mockResolvedValueOnce([{ id: 200 }]) // INSERT batch RETURNING id
      .mockResolvedValueOnce([]) // check already in batch

    mockPrisma.$executeRawUnsafe
      .mockResolvedValueOnce(0) // batchUpsertRows
      .mockResolvedValueOnce(1) // insert batch details
      .mockResolvedValueOnce(1) // update contacts status
      .mockResolvedValueOnce(1) // update batch record count

    const result = await service.run()

    expect(result.autoBatched.application).toBe(1)
    // Verify batch creation SQL was called
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO batches'),
      'pending',
    )
  })

  it('should skip contacts already in pending batch', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([makeEligibleContact()]) // loadContactProfiles
      .mockResolvedValueOnce([{ id: 1, person_id_icm: 'ICM-ELIG' }]) // get contact DB IDs
      .mockResolvedValueOnce([{ id: 100 }]) // find pending batch
      .mockResolvedValueOnce([{ contact_id: 1 }]) // already in batch!

    mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(0) // batchUpsertRows only

    const result = await service.run()

    expect(result.autoBatched.application).toBe(0)
    expect(result.autoBatched.cancellation).toBe(0)
    // Only the upsert call, no batch detail insert
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1)
  })

  it('should handle mixed application and cancellation in same run', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([makeEligibleContact(), makeInPayCancelContact()]) // loadContactProfiles
      .mockResolvedValueOnce([
        // get contact DB IDs
        { id: 1, person_id_icm: 'ICM-ELIG' },
        { id: 2, person_id_icm: 'ICM-CANCEL' },
      ])
      .mockResolvedValueOnce([{ id: 100 }]) // find pending batch
      .mockResolvedValueOnce([]) // check already in batch

    mockPrisma.$executeRawUnsafe
      .mockResolvedValueOnce(0) // batchUpsertRows
      .mockResolvedValueOnce(2) // insert batch details (both)
      .mockResolvedValueOnce(1) // update application contacts status
      .mockResolvedValueOnce(1) // update cancellation contacts status
      .mockResolvedValueOnce(1) // update batch record count

    const result = await service.run()

    expect(result.autoBatched.application).toBe(1)
    expect(result.autoBatched.cancellation).toBe(1)
  })

  it('should not auto-batch over_18 or other non-batchable statuses', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([makeOver18Contact()])

    mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(0) // batchUpsertRows only

    const result = await service.run()

    expect(result.autoBatched.application).toBe(0)
    expect(result.autoBatched.cancellation).toBe(0)
  })
})

describe('buildLoadContactProfilesSql', () => {
  it('should include changed_contacts CTE when threshold provided', () => {
    const { sql, params } = buildLoadContactProfilesSql(new Date('2026-02-12'))
    expect(sql).toContain('changed_contacts')
    expect(sql).toContain('IN (SELECT CONTACT_ROW_ID FROM changed_contacts)')
    expect(params).toHaveLength(1)
  })

  it('should exclude changed_contacts CTE when threshold is null', () => {
    const { sql, params } = buildLoadContactProfilesSql(null)
    expect(sql).not.toContain('changed_contacts')
    expect(params).toHaveLength(0)
  })

  it('should deduplicate contacts using DISTINCT ON and group ICM data by CONTACT_ROW_ID', () => {
    const { sql } = buildLoadContactProfilesSql(null)

    // Final SELECT deduplicates by CONTACT_ROW_ID
    expect(sql).toContain('DISTINCT ON (cases.CONTACT_ROW_ID)')

    // ICM aggregation CTEs group by CONTACT_ROW_ID (not CASE_ROW_ID)
    expect(sql).toContain('GROUP BY ec.CONTACT_ROW_ID')

    // ICM agg joins use CONTACT_ROW_ID
    expect(sql).toContain('icm_plc.CONTACT_ROW_ID = cases.CONTACT_ROW_ID')
    expect(sql).toContain('icm_ord.CONTACT_ROW_ID = cases.CONTACT_ROW_ID')
    expect(sql).toContain('icm_agr.CONTACT_ROW_ID = cases.CONTACT_ROW_ID')

    // No remaining CASE_ROW_ID joins in final SELECT
    expect(sql).not.toMatch(/LEFT JOIN.*CASE_ROW_ID = cases\.ROW_ID/)
  })
})
