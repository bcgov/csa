import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { Readable, Writable } from 'stream'
import { MisService } from './mis.service'
import { FileStorageService } from './file-storage/file-storage.service'
import { PrismaService } from 'src/common/database/prisma.service'

describe('MisService', () => {
  let service: MisService
  let mockFileStorage: {
    exists: ReturnType<typeof vi.fn>
    download: ReturnType<typeof vi.fn>
    move: ReturnType<typeof vi.fn>
  }
  let mockClient: {
    query: ReturnType<typeof vi.fn>
    release: ReturnType<typeof vi.fn>
  }
  let mockPrisma: { getPool: ReturnType<typeof vi.fn> }
  let configService: { get: ReturnType<typeof vi.fn> }
  let copyRowCount: number

  function createMockCopyStream() {
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
      final(callback) {
        callback()
      },
    })
    Object.defineProperty(stream, 'rowCount', {
      get: () => copyRowCount,
    })
    return stream
  }

  beforeEach(async () => {
    copyRowCount = 2

    mockFileStorage = {
      exists: vi.fn().mockResolvedValue(true),
      download: vi
        .fn()
        .mockImplementation(() => Promise.resolve(Readable.from(['HEADER\nrow1\nrow2']))),
      move: vi.fn().mockResolvedValue(undefined),
    }

    mockClient = {
      query: vi.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === 'string') return Promise.resolve()
        return createMockCopyStream()
      }),
      release: vi.fn(),
    }

    mockPrisma = {
      getPool: vi.fn().mockReturnValue({
        connect: vi.fn().mockResolvedValue(mockClient),
      }),
    }

    configService = {
      get: vi.fn((key: string) => {
        const values: Record<string, unknown> = {
          'sync.misS3Prefix': 'csas3/',
        }
        return values[key]
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MisService,
        { provide: FileStorageService, useValue: mockFileStorage },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile()

    service = module.get<MisService>(MisService)
  })

  describe('ingestAll', () => {
    it('should skip files that do not exist', async () => {
      mockFileStorage.exists.mockResolvedValue(false)

      const results = await service.ingestAll()

      expect(results).toHaveLength(3)
      expect(results.every((r) => r.skipped === true)).toBe(true)
      expect(results.every((r) => r.rows === 0)).toBe(true)
      expect(mockFileStorage.download).not.toHaveBeenCalled()
    })

    it('should ingest all 3 MIS files when they exist', async () => {
      const results = await service.ingestAll()

      expect(results).toHaveLength(3)
      expect(mockFileStorage.download).toHaveBeenCalledTimes(3)
      expect(results.every((r) => r.rows === 2)).toBe(true)
      expect(results.every((r) => r.skipped === undefined)).toBe(true)
    })

    it('should prepend S3 prefix to file keys', async () => {
      await service.ingestAll()

      const keys = mockFileStorage.download.mock.calls.map((call: unknown[]) => call[0])
      expect(keys).toContain('csas3/CSAS3_Payments.csv')
      expect(keys).toContain('csas3/CSAS3_Contract.csv')
      expect(keys).toContain('csas3/CSAS3_Placement.csv')
    })

    it('should move files to processed after successful ingestion', async () => {
      await service.ingestAll()

      expect(mockFileStorage.move).toHaveBeenCalledTimes(3)
      const moveCalls = mockFileStorage.move.mock.calls
      expect(moveCalls[0][0]).toBe('csas3/CSAS3_Payments.csv')
      expect(moveCalls[0][1]).toMatch(/^csas3\/processed\/\d{4}-\d{2}-\d{2}\/CSAS3_Payments\.csv$/)
    })

    it('should not move files when they are skipped', async () => {
      mockFileStorage.exists.mockResolvedValue(false)

      await service.ingestAll()

      expect(mockFileStorage.move).not.toHaveBeenCalled()
    })

    it('should throw when CSV has no data rows', async () => {
      copyRowCount = 0
      mockFileStorage.download.mockImplementation(() =>
        Promise.resolve(Readable.from(['HEADER\n'])),
      )

      await expect(service.ingestAll()).rejects.toThrow('CSV has no data rows')
    })

    it('should rollback on empty CSV (preserving existing data)', async () => {
      copyRowCount = 0
      mockFileStorage.download.mockImplementation(() =>
        Promise.resolve(Readable.from(['HEADER\n'])),
      )

      try {
        await service.ingestAll()
      } catch {
        // Expected
      }

      const rollbackCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      )
      expect(rollbackCalls.length).toBeGreaterThan(0)
    })

    it('should continue if move fails (non-fatal)', async () => {
      mockFileStorage.move.mockRejectedValue(new Error('Access Denied'))

      const results = await service.ingestAll()

      expect(results).toHaveLength(3)
      expect(results.every((r) => r.rows === 2)).toBe(true)
    })
  })
})
