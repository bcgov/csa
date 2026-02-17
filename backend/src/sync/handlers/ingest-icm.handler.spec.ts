import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { IngestIcmHandler } from './ingest-icm.handler'
import { IcmService } from '../icm/icm.service'
import { JobsService } from 'src/jobs/jobs.service'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'

const mockContext: JobContext = {
  jobRunId: 1,
  jobType: JobType.INGEST_ICM,
  jobTrigger: JobTrigger.CRON,
  retryCount: 0,
}

describe('IngestIcmHandler', () => {
  let handler: IngestIcmHandler
  let mockJobsService: { getLastSuccessTimestamp: ReturnType<typeof vi.fn> }
  let mockIcmService: { ingestAll: ReturnType<typeof vi.fn> }
  let mockConfigService: { get: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockJobsService = {
      getLastSuccessTimestamp: vi.fn().mockResolvedValue(null),
    }

    mockIcmService = {
      ingestAll: vi.fn().mockResolvedValue([
        { name: 'cases', fetched: 10, upserted: 10 },
        { name: 'placements', fetched: 5, upserted: 5 },
      ]),
    }

    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'sync.icmCursorLookbackDays') return 2
        return undefined
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestIcmHandler,
        { provide: JobsService, useValue: mockJobsService },
        { provide: IcmService, useValue: mockIcmService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    handler = module.get<IngestIcmHandler>(IngestIcmHandler)
  })

  it('should have jobType INGEST_ICM', () => {
    expect(handler.jobType).toBe(JobType.INGEST_ICM)
  })

  describe('execute', () => {
    it('should do full load when no previous successful run', async () => {
      mockJobsService.getLastSuccessTimestamp.mockResolvedValue(null)

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata?.lastUpdated).toBeNull()
      expect(mockIcmService.ingestAll).toHaveBeenCalledWith(expect.any(Array), null)
    })

    it('should compute cursor date from last success minus lookback days', async () => {
      const lastSuccess = new Date('2026-01-10T12:00:00Z')
      mockJobsService.getLastSuccessTimestamp.mockResolvedValue(lastSuccess)

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      // lastUpdated should be lastSuccess - 2 days
      const expectedCursor = new Date('2026-01-08T12:00:00Z')
      expect(result.metadata?.lastUpdated).toBe(expectedCursor.toISOString())

      const passedCursor = mockIcmService.ingestAll.mock.calls[0][1]
      expect(passedCursor.getTime()).toBe(expectedCursor.getTime())
    })

    it('should aggregate totals from all API results', async () => {
      const result = await handler.execute(mockContext)

      expect(result.metadata?.totalFetched).toBe(15)
      expect(result.metadata?.totalUpserted).toBe(15)
      expect(result.message).toContain('15 fetched')
    })

    it('should use INGEST_DATA job type for last success lookup', async () => {
      await handler.execute(mockContext)

      expect(mockJobsService.getLastSuccessTimestamp).toHaveBeenCalledWith(JobType.INGEST_DATA)
    })
  })
})
