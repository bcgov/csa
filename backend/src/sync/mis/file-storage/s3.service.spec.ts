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
          'sync.misStalenessThresholdHours': 48,
        }
        return values[key]
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [S3Service, { provide: ConfigService, useValue: configService }],
    }).compile()

    service = module.get<S3Service>(S3Service)
  })

  describe('isStale', () => {
    it('should return true when file is older than threshold', async () => {
      const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000)

      vi.spyOn(service, 'getFileInfo').mockResolvedValue({
        key: 'test.csv',
        lastModified: threeDaysAgo,
      })

      const result = await service.isStale('test.csv')

      expect(result).toBe(true)
    })

    it('should return false when file is within threshold', async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000)

      vi.spyOn(service, 'getFileInfo').mockResolvedValue({
        key: 'test.csv',
        lastModified: oneHourAgo,
      })

      const result = await service.isStale('test.csv')

      expect(result).toBe(false)
    })
  })
})
