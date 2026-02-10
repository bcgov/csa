import { Test, TestingModule } from '@nestjs/testing'
import { IcmService, BATCH_SIZE } from './icm.service'
import { IcmDataSource } from './data-source/icm-data-source'
import { ConfigService } from '@nestjs/config'
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

    const mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'sync.postgresSchema') return 'csa'
        return undefined
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IcmService,
        { provide: IcmDataSource, useValue: mockIcmDataSource },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
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

    it('should build correct multi-row INSERT ON CONFLICT SQL', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([
        { 'Row Id': '1-ABC', 'Case Num': 'CS001' },
        { 'Row Id': '2-DEF', 'Case Num': 'CS002' },
      ])

      await service.ingestResource(testConfig)

      const sql = mockPrisma.$executeRawUnsafe.mock.calls[0][0]
      expect(sql).toContain('INSERT INTO csa.stg_icm_cases')
      expect(sql).toContain('ON CONFLICT (ROW_ID) DO UPDATE SET')
      expect(sql).toContain('CASE_NUM = EXCLUDED.CASE_NUM')
      // Two value groups: ($1, $2, NOW()), ($3, $4, NOW())
      expect(sql).toContain('$1')
      expect(sql).toContain('$3')
    })

    it('should pass correct values from all records', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([
        { 'Row Id': '1-ABC', 'Case Num': 'CS001' },
        { 'Row Id': '2-DEF', 'Case Num': 'CS002' },
      ])

      await service.ingestResource(testConfig)

      const args = mockPrisma.$executeRawUnsafe.mock.calls[0]
      // args[0] is SQL, args[1..] are values for all records
      expect(args[1]).toBe('1-ABC')
      expect(args[2]).toBe('CS001')
      expect(args[3]).toBe('2-DEF')
      expect(args[4]).toBe('CS002')
    })

    it('should map null for missing API fields', async () => {
      mockIcmDataSource.fetchAll.mockResolvedValue([
        { 'Row Id': '1-ABC' }, // missing 'Case Num'
      ])

      await service.ingestResource(testConfig)

      const args = mockPrisma.$executeRawUnsafe.mock.calls[0]
      expect(args[2]).toBeNull() // CASE_NUM should be null
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
