import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from 'src/common/database/prisma.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFindAgedOutContactIdsSql, buildLoadContactProfilesSql } from './eligibility.queries'
import { EligibilityService } from './eligibility.service'

describe('EligibilityService', () => {
  let service: EligibilityService
  let mockPrisma: {
    $queryRawUnsafe: ReturnType<typeof vi.fn>
    $executeRawUnsafe: ReturnType<typeof vi.fn>
  }

  const allTablesPopulated = [
    'stg_icm_cases',
    'stg_icm_placements',
    'stg_icm_legal_authority_admin',
    'stg_icm_legal_authority',
    'stg_icm_agreement',
    'stg_icm_orders',
    'stg_mis_payments',
    'stg_mis_contracts',
    'stg_mis_placements',
  ].map((name) => ({ table_name: name, has_data: true }))

  beforeEach(async () => {
    mockPrisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValueOnce(allTablesPopulated).mockResolvedValue([]),
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

  it('should throw when staging tables are empty', async () => {
    const partiallyEmpty = allTablesPopulated.map((t) =>
      t.table_name === 'stg_mis_payments' || t.table_name === 'stg_icm_cases'
        ? { ...t, has_data: false }
        : t,
    )
    mockPrisma.$queryRawUnsafe.mockReset().mockResolvedValueOnce(partiallyEmpty)

    await expect(service.run(null)).rejects.toThrow(
      'Staging validation failed: empty tables [stg_icm_cases, stg_mis_payments]',
    )
  })

  it('should proceed when all staging tables have data', async () => {
    const result = await service.run(null)
    expect(result.processed).toBe(0)
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('UNION ALL'))
  })

  it('should return zero counts when no staging data', async () => {
    const result = await service.run(null)
    expect(result.processed).toBe(0)
    expect(result.statusChanges).toBe(0)
  })

  it('should process contacts from staging and return stats', async () => {
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
        isIneligible: false,
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

    const result = await service.run(null)
    expect(result.processed).toBe(1)
  })

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
      isIneligible: false,
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
    const logSpy = vi.spyOn(service['logger'], 'crit')

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      makeOver18Contact({ personIdIcm: null, existingContactId: 99 }),
    ])
    const result = await service.run(null)

    expect(result.statusChanges).toBe(1)
    expect(result.skipped).toBe(1)
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('empty/null in required fields'),
      expect.objectContaining({ category: 'DATA_QUALITY' }),
    )
  })

  it('should skip invalid contacts and upsert valid ones in same batch', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      makeOver18Contact({ personIdIcm: 'ICM-VALID', existingContactId: 99 }),
      makeOver18Contact({ personIdIcm: null, existingContactId: 99 }),
    ])

    const result = await service.run(null)

    expect(result.statusChanges).toBe(2)
    expect(result.skipped).toBe(1)
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1)
  })

  it('should report caseRowId and null fields in the warning', async () => {
    const logSpy = vi.spyOn(service['logger'], 'crit')

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      makeOver18Contact({ personIdIcm: null, existingContactId: 99 }),
    ])
    await service.run(null)

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('person_id_icm'),
      expect.objectContaining({
        caseRowId: 'CASE-1',
        invalidFields: expect.arrayContaining(['person_id_icm']),
      }),
    )
  })

  it('should upsert protected contacts with existing csa_status preserved', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      makeOver18Contact({ personIdIcm: 'ICM-HOLD', csaStatus: 'on_hold', existingContactId: 99 }),
    ])

    const result = await service.run(null)

    expect(result.processed).toBe(1)
    expect(result.statusChanges).toBe(0)
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1)
  })

  it('should preserve protected status and run eligibility for others in same batch', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      makeOver18Contact({ personIdIcm: 'ICM-HOLD', csaStatus: 'on_hold', existingContactId: 99 }),
      makeOver18Contact({ personIdIcm: 'ICM-ELIG', csaStatus: 'eligible', existingContactId: 88 }),
    ])

    const result = await service.run(null)

    expect(result.processed).toBe(2)
    expect(result.statusChanges).toBe(1)
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1)
  })

  it('should upsert contacts with no status transition (existing status preserved)', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      makeEligibleContact({ csaStatus: 'eligible', existingContactId: 10 }),
    ])

    const result = await service.run(null)

    expect(result.processed).toBe(1)
    expect(result.statusChanges).toBe(0)
    expect(result.stepCounts.noChange).toBe(1)
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1) // upsert only
  })

  it('should pass threshold to query when threshold is provided', async () => {
    const threshold = new Date('2026-02-12T10:00:00Z') // already computed by handler

    await service.run(threshold)

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('changed_contacts'),
      threshold,
    )
  })

  it('should use full load when threshold is null', async () => {
    await service.run(null)

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.not.stringContaining('changed_contacts'),
    )
  })

  it('should query for aged-out contacts in incremental mode', async () => {
    const threshold = new Date('2026-02-12T10:00:00Z')

    await service.run(threshold)

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('csa_status IN'),
      expect.any(Date),
    )
  })

  it('should not query for aged-out contacts in full load mode', async () => {
    await service.run(null)

    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalledWith(
      expect.stringContaining('csa_status IN'),
      expect.any(Date),
    )
  })

  it('should include aged-out IDs in profile query when found', async () => {
    const threshold = new Date('2026-02-12T10:00:00Z')

    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ person_id_icm: 'AGED-1' }, { person_id_icm: 'AGED-2' }]) // aged-out query
      .mockResolvedValueOnce([]) // loadContactProfiles

    await service.run(threshold)

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('ANY($2::TEXT[])'),
      threshold,
      ['AGED-1', 'AGED-2'],
    )
  })

  // Helpers

  //contact that reaches step 7->eligible (under 18, valid placement + order)
  function makeEligibleContact(overrides: Record<string, unknown> = {}) {
    const now = new Date()
    const prevMonth = new Date(Date.UTC(now.getFullYear(), now.getUTCMonth() - 1, 15))
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
      isIneligible: false,
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

  // in_pay contact that triggers step 9->not_eligible_in_pay (deceased)
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
      isIneligible: false,
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

  it('should process eligible contacts and upsert to master table', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([makeEligibleContact()])

    const result = await service.run()

    expect(result.processed).toBe(1)
    expect(result.statusChanges).toBe(1)
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1) // batchUpsertRows only
  })

  it('should process not_eligible_in_pay contacts and upsert to master table', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([makeInPayCancelContact()])

    const result = await service.run()

    expect(result.processed).toBe(1)
    expect(result.statusChanges).toBe(1)
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1) // batchUpsertRows only
  })

  it('should process mixed eligible and not_eligible_in_pay contacts in same run', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      makeEligibleContact(),
      makeInPayCancelContact(),
    ])

    const result = await service.run()

    expect(result.processed).toBe(2)
    expect(result.statusChanges).toBe(2)
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1) // batchUpsertRows only
  })

  it('should skip new contacts who are already over 18', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([makeOver18Contact()])

    const result = await service.run()

    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.statusChanges).toBe(0)
  })
})

describe('buildLoadContactProfilesSql', () => {
  it('should include changed_contacts CTE when threshold provided', () => {
    const { sql, params } = buildLoadContactProfilesSql(new Date('2026-02-12'))
    expect(sql).toContain('changed_contacts')
    expect(sql).toContain('IN (SELECT X_CONTACT_NUM FROM changed_contacts)')
    expect(params).toHaveLength(1)
  })

  it('should exclude changed_contacts CTE when threshold is null', () => {
    const { sql, params } = buildLoadContactProfilesSql(null)
    expect(sql).not.toContain('changed_contacts')
    expect(params).toHaveLength(0)
  })

  it('should deduplicate contacts using DISTINCT ON X_CONTACT_NUM and group data by X_CONTACT_NUM', () => {
    const { sql } = buildLoadContactProfilesSql(null)

    // Final SELECT deduplicates by X_CONTACT_NUM (person ID)
    expect(sql).toContain('DISTINCT ON (cases.X_CONTACT_NUM)')

    // Aggregation CTEs group by X_CONTACT_NUM (not CONTACT_ROW_ID)
    expect(sql).toContain('GROUP BY eligible_cases.X_CONTACT_NUM')

    // Agg joins use X_CONTACT_NUM
    expect(sql).toContain('icm_plc.X_CONTACT_NUM = cases.X_CONTACT_NUM')
    expect(sql).toContain('icm_ord.X_CONTACT_NUM = cases.X_CONTACT_NUM')
    expect(sql).toContain('icm_agr.X_CONTACT_NUM = cases.X_CONTACT_NUM')

    // No remaining CASE_ROW_ID joins in final SELECT
    expect(sql).not.toMatch(/LEFT JOIN.*CASE_ROW_ID = cases\.ROW_ID/)
  })

  it('should join legal authority on CONTACT_ROW_ID (PersonIcmId), not ROW_ID (CaseId)', () => {
    const { sql } = buildLoadContactProfilesSql(null)

    // latest_legal_auth joins on PersonIcmId
    expect(sql).toContain('eligible_cases.CONTACT_ROW_ID = legal_auth.PAR_ROW_ID')
    // Must NOT join on case ROW_ID
    expect(sql).not.toContain('eligible_cases.ROW_ID = legal_auth.PAR_ROW_ID')
  })

  it('should join MIS data via placement - contract - payment', () => {
    const { sql } = buildLoadContactProfilesSql(null)

    // eligible_cases carries PERSON_ID_MIS
    expect(sql).toContain('cases.PERSON_ID_MIS')

    // MIS placements join directly through PERSON_ID_MIS on eligible_cases
    expect(sql).toContain('mis_plc.person_id_mis = eligible_cases.PERSON_ID_MIS')

    // MIS contracts join via service_provider_id and contract_number through placements
    expect(sql).toContain('mis_con.service_provider_id = mis_plc.service_provider_id')
    expect(sql).toContain('mis_con.contract_number = mis_plc.contract_number')

    // MIS payments join via contract_number through contracts
    expect(sql).toContain('mis_pay.contract_number = mis_con.contract_number')

    // Final SELECT joins MIS aggs on X_CONTACT_NUM
    expect(sql).toContain('mis_pay.X_CONTACT_NUM = cases.X_CONTACT_NUM')
    expect(sql).toContain('mis_con.X_CONTACT_NUM = cases.X_CONTACT_NUM')
    expect(sql).toContain('mis_plc.X_CONTACT_NUM = cases.X_CONTACT_NUM')

    // No MIS joins through contacts master table
    expect(sql).not.toContain('master_contacts.person_id_mis')
  })

  it('should join changed_contacts MIS sections via placement', () => {
    const { sql } = buildLoadContactProfilesSql(new Date('2026-02-12'))

    // MIS change detection uses stg_icm_cases, not contacts master table
    expect(sql).not.toContain('FROM contacts mc')
    // Payments change detection goes through contracts - placements - cases
    expect(sql).toContain('mis_pay.contract_number = mis_con.contract_number')

    expect(sql).toContain('legal_auth.PAR_ROW_ID = cases.CONTACT_ROW_ID')
    expect(sql).not.toContain('legal_auth.PAR_ROW_ID = cases.ROW_ID')
  })

  it('should include ANY clause when agedOutContactIds provided in incremental mode', () => {
    const { sql, params } = buildLoadContactProfilesSql(new Date('2026-02-12'), ['ICM-1', 'ICM-2'])
    expect(sql).toContain('ANY($2::TEXT[])')
    expect(sql).toContain('changed_contacts')
    expect(params).toEqual([new Date('2026-02-12'), ['ICM-1', 'ICM-2']])
  })

  it('should not include ANY clause when agedOutContactIds is empty', () => {
    const { sql, params } = buildLoadContactProfilesSql(new Date('2026-02-12'), [])
    expect(sql).not.toContain('ANY($2::TEXT[])')
    expect(sql).toContain('changed_contacts')
    expect(params).toEqual([new Date('2026-02-12')])
  })

  it('should ignore agedOutContactIds in full load mode', () => {
    const { sql, params } = buildLoadContactProfilesSql(null, ['ICM-1'])
    expect(sql).not.toContain('ANY')
    expect(sql).not.toContain('changed_contacts')
    expect(params).toEqual([])
  })
})

describe('buildFindAgedOutContactIdsSql', () => {
  it('should query contacts with transitionable statuses and DOB before cutoff', () => {
    const cutoff = new Date('2008-03-01')
    const { sql, params } = buildFindAgedOutContactIdsSql(cutoff)

    expect(sql).toContain('csa_status IN')
    expect(sql).toContain("'eligible'")
    expect(sql).toContain("'in_pay'")
    expect(sql).toContain("'not_eligible_out_of_pay'")
    expect(sql).toContain('date_of_birth < $1')
    expect(sql).toContain('date_of_birth IS NOT NULL')
    expect(params).toEqual([cutoff])
  })
})
