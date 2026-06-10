import { Test, TestingModule } from '@nestjs/testing'
import { IcmService, BATCH_SIZE } from './icm.service'
import { IcmDataSource } from './data-source/icm-data-source'
import { PrismaService } from 'src/common/database/prisma.service'
import { filterValidOocAgreementLineItems } from './agreement-lines'
import { IcmApiConfig } from './icm.config'
import { FieldMapEntry } from './field-maps'

const testFieldMap: FieldMapEntry[] = [
  { sourceField: 'ROW_ID', sourceLabel: 'Row Id', masterField: 'case_row_id' },
  { sourceField: 'CASE_NUM', sourceLabel: 'Case Num', masterField: 'case_number' },
]

const testConfig: IcmApiConfig = {
  name: 'cases',
  endpoint: '/data/Case',
  stagingTable: 'stg_icm_cases',
  primaryKey: 'ROW_ID',
  cursorLabel: 'Last Updated Date',
  fieldMap: testFieldMap,
}

describe('IcmService', () => {
  let service: IcmService
  let mockIcmDataSource: { fetchAll: ReturnType<typeof vi.fn> }
  let mockPrisma: { $executeRawUnsafe: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockIcmDataSource = {
      fetchAll: vi.fn().mockResolvedValue([]),
    }

    mockPrisma = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IcmService,
        { provide: IcmDataSource, useValue: mockIcmDataSource },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<IcmService>(IcmService)
  })

  describe('ingestResource', () => {
    it('should fetch records and batch upsert them', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([
        { 'Row Id': '1-ABC', 'Case Num': 'CS001' },
        { 'Row Id': '2-DEF', 'Case Num': 'CS002' },
      ])

      const result = await service.ingestResource(testConfig)

      expect(result.name).toBe('cases')
      expect(result.fetched).toBe(2)
      expect(result.upserted).toBe(2)
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1)
    })

    it('should apply filterItems before upsert', async () => {
      const filteredConfig: IcmApiConfig = {
        ...testConfig,
        name: 'ooc_agreement_lines',
        filterItems: filterValidOocAgreementLineItems,
      }

      mockIcmDataSource.fetchAll.mockResolvedValue([
        { Id: 'LINE-1', 'Agreement Id': 'AGR-1', 'ICM Person ID': 'PERSON-1' },
        { Id: 'LINE-2', 'Agreement Id': 'AGR-2', 'ICM Person ID': '' },
      ])

      const result = await service.ingestResource(filteredConfig)

      expect(result.fetched).toBe(1)
      expect(result.upserted).toBe(1)
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1)
    })

    it('should build correct unnest INSERT ON CONFLICT SQL with data_changed_at', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([
        { 'Row Id': '1-ABC', 'Case Num': 'CS001' },
        { 'Row Id': '2-DEF', 'Case Num': 'CS002' },
      ])

      await service.ingestResource(testConfig)

      const sql = mockPrisma.$executeRawUnsafe.mock.calls[0][0]
      expect(sql).toContain('INSERT INTO stg_icm_cases')
      expect(sql).toContain('ON CONFLICT (ROW_ID) DO UPDATE SET')
      expect(sql).toContain('CASE_NUM = EXCLUDED.CASE_NUM')
      expect(sql).toContain('unnest(')
      expect(sql).toContain('$1::text[]')
      expect(sql).toContain('$2::text[]')
      // New: data_changed_at in INSERT and IS DISTINCT FROM in ON CONFLICT
      expect(sql).toContain('data_changed_at')
      expect(sql).toContain('IS DISTINCT FROM')
    })

    it('should pass correct arrays per column', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([
        { 'Row Id': '1-ABC', 'Case Num': 'CS001' },
        { 'Row Id': '2-DEF', 'Case Num': 'CS002' },
      ])

      await service.ingestResource(testConfig)

      const args = mockPrisma.$executeRawUnsafe.mock.calls[0]
      // args[0] is SQL, args[1] is ROW_ID array, args[2] is CASE_NUM array
      expect(args[1]).toEqual(['1-ABC', '2-DEF'])
      expect(args[2]).toEqual(['CS001', 'CS002'])
    })

    it('should map null for missing API fields', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([
        { 'Row Id': '1-ABC' }, // missing 'Case Num'
      ])

      await service.ingestResource(testConfig)

      const args = mockPrisma.$executeRawUnsafe.mock.calls[0]
      expect(args[2]).toEqual([null]) // CASE_NUM array should contain null
    })

    it('should return zero counts for empty results', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([])

      const result = await service.ingestResource(testConfig)

      expect(result.fetched).toBe(0)
      expect(result.upserted).toBe(0)
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled()
    })

    it('should pass lastUpdated to fetchAll', async () => {
      const cursor = new Date('2026-01-01')
      await service.ingestResource(testConfig, cursor)

      expect(mockIcmDataSource.fetchAll).toHaveBeenCalledWith(testConfig, cursor)
    })

    it('should split records into batches', async () => {
      // Create BATCH_SIZE + 1 records to force 2 batches
      const records = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => ({
        'Row Id': `ID-${i}`,
        'Case Num': `CS${i}`,
      }))
      mockIcmDataSource.fetchAll.mockResolvedValue(records)

      const result = await service.ingestResource(testConfig)

      expect(result.fetched).toBe(BATCH_SIZE + 1)
      expect(result.upserted).toBe(BATCH_SIZE + 1)
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2)
    })

    it('should store timestamp fields as naive PT ISO strings and date fields as ISO date strings', async () => {
      const dateFieldMap: FieldMapEntry[] = [
        { sourceField: 'ROW_ID', sourceLabel: 'Row Id', masterField: 'case_row_id' },
        {
          sourceField: 'LAST_UPD',
          sourceLabel: 'Last Updated Date',
          masterField: 'last_upd',
          dbType: 'timestamp',
        },
        {
          sourceField: 'BIRTH_DT',
          sourceLabel: 'Birth Date',
          masterField: 'date_of_birth',
          dbType: 'date',
        },
      ]
      const dateConfig: IcmApiConfig = {
        ...testConfig,
        fieldMap: dateFieldMap,
      }

      mockIcmDataSource.fetchAll.mockResolvedValue([
        {
          'Row Id': '1-ABC',
          'Last Updated Date': '01/13/2026 10:51:03',
          'Birth Date': '01/01/2012',
        },
      ])

      await service.ingestResource(dateConfig)

      const args = mockPrisma.$executeRawUnsafe.mock.calls[0]
      // args[0] = SQL, args[1] = ROW_ID array, args[2] = LAST_UPD array, args[3] = BIRTH_DT array
      expect(args[1]).toEqual(['1-ABC'])
      // Timestamp: stored as naive ISO (no UTC conversion) — faithful PT value
      expect(args[2]).toEqual(['2026-01-13T10:51:03'])
      // Date: calendar date stored as-is, no timezone conversion
      expect(args[3]).toEqual(['2012-01-01'])
    })

    it('should include data_changed_at in INSERT with NOW() for new records', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([{ 'Row Id': '1-ABC', 'Case Num': 'CS001' }])

      await service.ingestResource(testConfig)

      const sql: string = mockPrisma.$executeRawUnsafe.mock.calls[0][0]
      // INSERT should include data_changed_at column
      expect(sql).toMatch(/INSERT INTO stg_icm_cases \(.*data_changed_at\)/)
      // SELECT should include NOW() for data_changed_at
      expect(sql).toMatch(/SELECT.*NOW\(\), NOW\(\)/)
    })

    it('should use IS DISTINCT FROM for change detection on non-excluded fields', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([{ 'Row Id': '1-ABC', 'Case Num': 'CS001' }])

      await service.ingestResource(testConfig)

      const sql: string = mockPrisma.$executeRawUnsafe.mock.calls[0][0]
      // CASE_NUM (non-PK, non-excluded) should be in the IS DISTINCT FROM comparison
      expect(sql).toContain('(stg_icm_cases.CASE_NUM) IS DISTINCT FROM (EXCLUDED.CASE_NUM)')
    })

    it('should exclude fields marked excludeFromChangeDetection from IS DISTINCT FROM', async () => {
      const fieldMapWithExclusion: FieldMapEntry[] = [
        { sourceField: 'ROW_ID', sourceLabel: 'Row Id', masterField: 'case_row_id' },
        { sourceField: 'CASE_NUM', sourceLabel: 'Case Num', masterField: 'case_number' },
        {
          sourceField: 'X_CSA_PAY_STATUS',
          sourceLabel: 'CSA Status',
          masterField: 'csa_status',
          excludeFromChangeDetection: true,
        },
        {
          sourceField: 'LAST_UPD',
          sourceLabel: 'Last Updated',
          masterField: 'last_upd',
          dbType: 'timestamp',
          excludeFromChangeDetection: true,
        },
      ]
      const configWithExclusion: IcmApiConfig = { ...testConfig, fieldMap: fieldMapWithExclusion }

      mockIcmDataSource.fetchAll.mockResolvedValue([
        {
          'Row Id': '1-ABC',
          'Case Num': 'CS001',
          'CSA Status': 'in_pay',
          'Last Updated': '01/01/2026 10:00:00',
        },
      ])

      await service.ingestResource(configWithExclusion)

      const sql: string = mockPrisma.$executeRawUnsafe.mock.calls[0][0]

      // Extract the IS DISTINCT FROM clause
      const distinctMatch = sql.match(/WHEN \((.+?)\) IS DISTINCT FROM \((.+?)\)/)
      expect(distinctMatch).not.toBeNull()

      const oldTuple = distinctMatch![1]
      const newTuple = distinctMatch![2]

      // CASE_NUM should be in the comparison (not excluded, not PK)
      expect(oldTuple).toContain('CASE_NUM')
      expect(newTuple).toContain('EXCLUDED.CASE_NUM')

      // Excluded fields should NOT be in the comparison
      expect(oldTuple).not.toContain('X_CSA_PAY_STATUS')
      expect(oldTuple).not.toContain('LAST_UPD')
      expect(newTuple).not.toContain('EXCLUDED.X_CSA_PAY_STATUS')
      expect(newTuple).not.toContain('EXCLUDED.LAST_UPD')

      // PK should NOT be in the comparison
      expect(oldTuple).not.toContain('ROW_ID')

      // But excluded fields should still be in the UPDATE SET
      expect(sql).toContain('X_CSA_PAY_STATUS = EXCLUDED.X_CSA_PAY_STATUS')
      expect(sql).toContain('LAST_UPD = EXCLUDED.LAST_UPD')
    })

    it('should preserve existing data_changed_at when no real data changes', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([{ 'Row Id': '1-ABC', 'Case Num': 'CS001' }])

      await service.ingestResource(testConfig)

      const sql: string = mockPrisma.$executeRawUnsafe.mock.calls[0][0]
      // The ELSE branch should preserve existing data_changed_at
      expect(sql).toContain('ELSE stg_icm_cases.data_changed_at')
    })

    it('should pass null for empty date fields', async () => {
      const dateFieldMap: FieldMapEntry[] = [
        { sourceField: 'ROW_ID', sourceLabel: 'Row Id', masterField: 'case_row_id' },
        {
          sourceField: 'LAST_UPD',
          sourceLabel: 'Last Updated Date',
          masterField: 'last_upd',
          dbType: 'timestamp',
        },
      ]
      const dateConfig: IcmApiConfig = { ...testConfig, fieldMap: dateFieldMap }

      mockIcmDataSource.fetchAll.mockResolvedValue([{ 'Row Id': '1-ABC', 'Last Updated Date': '' }])

      await service.ingestResource(dateConfig)

      const args = mockPrisma.$executeRawUnsafe.mock.calls[0]
      expect(args[2]).toEqual([null])
    })
  })

  describe('ingestAll', () => {
    it('should ingest all passed configs', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([{ 'Row Id': '1' }])

      const results = await service.ingestAll([testConfig])

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('cases')
      expect(mockIcmDataSource.fetchAll).toHaveBeenCalledWith(testConfig, undefined)
    })
  })
})
