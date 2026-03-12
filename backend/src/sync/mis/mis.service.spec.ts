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
    it('should throw when some but not all MIS files are missing', async () => {
      mockFileStorage.exists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)

      await expect(service.ingestAll()).rejects.toThrow(
        'MIS ingestion aborted: missing files [rap_contracts.csv, rap_placements.csv]',
      )
      expect(mockFileStorage.download).not.toHaveBeenCalled()
    })

    it('should return empty results when no files are present', async () => {
      mockFileStorage.exists.mockResolvedValue(false)

      const results = await service.ingestAll()

      expect(results).toEqual([])
      expect(mockFileStorage.download).not.toHaveBeenCalled()
    })

    it('should ingest all 3 MIS files when they exist', async () => {
      const files = await service.ingestAll()

      expect(files).toHaveLength(3)
      expect(mockFileStorage.download).toHaveBeenCalledTimes(3)
      expect(files.every((r) => r.rows === 2)).toBe(true)
    })

    it('should prepend S3 prefix to file keys', async () => {
      await service.ingestAll()

      const existsKeys = mockFileStorage.exists.mock.calls.map((call: unknown[]) => call[0])
      expect(existsKeys).toContain('csas3/rap_payments.csv')
      expect(existsKeys).toContain('csas3/rap_contracts.csv')
      expect(existsKeys).toContain('csas3/rap_placements.csv')
    })

    it('should not move files if any ingestion fails', async () => {
      mockFileStorage.download
        .mockResolvedValueOnce(Readable.from(['HEADER\nrow1\nrow2']))
        .mockRejectedValueOnce(new Error('S3 read error'))

      await expect(service.ingestAll()).rejects.toThrow('S3 read error')
      expect(mockFileStorage.move).not.toHaveBeenCalled()
    })

    it('should move all files to PROCESSED after all succeed', async () => {
      await service.ingestAll()

      expect(mockFileStorage.move).toHaveBeenCalledTimes(3)
      const moveKeys = mockFileStorage.move.mock.calls.map((c: unknown[]) => c[0])
      expect(moveKeys).toContain('csas3/rap_payments.csv')
      expect(moveKeys).toContain('csas3/rap_contracts.csv')
      expect(moveKeys).toContain('csas3/rap_placements.csv')
    })

    it('should throw when CSV has no data rows', async () => {
      copyRowCount = 0
      mockFileStorage.download.mockImplementation(() =>
        Promise.resolve(Readable.from(['HEADER\n'])),
      )

      await expect(service.ingestAll()).rejects.toThrow('CSV has no data rows')
      expect(mockFileStorage.move).not.toHaveBeenCalled()
    })

    it('should use temp table, truncate, and reload pattern', async () => {
      await service.ingestAll()

      const queryCalls = mockClient.query.mock.calls.map((call: unknown[]) => call[0])
      const stringCalls = queryCalls.filter((q: unknown) => typeof q === 'string') as string[]

      expect(stringCalls.some((q) => q.includes('CREATE TEMP TABLE'))).toBe(true)
      expect(stringCalls.some((q) => q.includes('TRUNCATE'))).toBe(true)
      expect(stringCalls.some((q) => q.includes('INSERT INTO') && !q.includes('ON CONFLICT'))).toBe(
        true,
      )
    })

    it('should succeed even if move to PROCESSED fails (non-fatal)', async () => {
      mockFileStorage.move.mockRejectedValue(new Error('Access Denied'))

      const files = await service.ingestAll()

      expect(files).toHaveLength(3)
      expect(files.every((r) => r.rows === 2)).toBe(true)
    })
  })
})
