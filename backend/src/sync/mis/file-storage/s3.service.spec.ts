import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { S3Service } from './s3.service'

describe('S3Service', () => {
  let service: S3Service
  let configService: { get: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    configService = {
      get: vi.fn((key: string) => {
        const values: Record<string, unknown> = {
          'sync.s3Uri': 'http://minioadmin:minioadmin@localhost:9000',
          'sync.s3Bucket': 'test-bucket',
        }
        return values[key]
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [S3Service, { provide: ConfigService, useValue: configService }],
    }).compile()

    service = module.get<S3Service>(S3Service)
  })

  describe('exists', () => {
    it('should return true when file exists', async () => {
      vi.spyOn(service as any, 'getClient').mockReturnValue({
        statObject: vi.fn().mockResolvedValue({ size: 100, lastModified: new Date() }),
      })

      const result = await service.exists('test.csv')

      expect(result).toBe(true)
    })

    it('should return false when file is not found', async () => {
      vi.spyOn(service as any, 'getClient').mockReturnValue({
        statObject: vi.fn().mockRejectedValue(new Error('Not Found')),
      })

      const result = await service.exists('missing.csv')

      expect(result).toBe(false)
    })

    it('should rethrow unexpected errors', async () => {
      vi.spyOn(service as any, 'getClient').mockReturnValue({
        statObject: vi.fn().mockRejectedValue(new Error('Access Denied')),
      })

      await expect(service.exists('test.csv')).rejects.toThrow('Access Denied')
    })
  })

  describe('move', () => {
    it('should copy then remove the source object', async () => {
      const mockCopy = vi.fn().mockResolvedValue({})
      const mockRemove = vi.fn().mockResolvedValue(undefined)

      vi.spyOn(service as any, 'getClient').mockReturnValue({
        copyObject: mockCopy,
        removeObject: mockRemove,
      })

      await service.move('csas3/file.csv', 'csas3/processed/2026-02-10/file.csv')

      expect(mockCopy).toHaveBeenCalledWith(
        'test-bucket',
        'csas3/processed/2026-02-10/file.csv',
        '/test-bucket/csas3/file.csv',
        expect.any(Object),
      )
      expect(mockRemove).toHaveBeenCalledWith('test-bucket', 'csas3/file.csv')
    })
  })
})
