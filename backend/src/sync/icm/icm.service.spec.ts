import { Test, TestingModule } from '@nestjs/testing'
import { IcmService, BATCH_SIZE } from './icm.service'
import { IcmDataSource } from './data-source/icm-data-source'
import { PrismaService } from 'src/common/database/prisma.service'
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

    it('should build correct unnest INSERT ON CONFLICT SQL', async () => {
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
