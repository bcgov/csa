import { Test, TestingModule } from '@nestjs/testing'
import { IngestMisHandler } from './ingest-mis.handler'
import { MisService } from '../mis/mis.service'
import { JobsService } from 'src/jobs/jobs.service'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'

const mockContext: JobContext = {
  jobRunId: 2,
  jobType: JobType.INGEST_MIS,
  jobTrigger: JobTrigger.CRON,
  retryCount: 0,
}

describe('IngestMisHandler', () => {
  let handler: IngestMisHandler
  let mockMisService: {
    readLastUpdated: ReturnType<typeof vi.fn>
    ingestAll: ReturnType<typeof vi.fn>
  }
  let mockJobsService: {
    getLastSuccessfulJob: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockMisService = {
      readLastUpdated: vi.fn().mockResolvedValue('20260221'),
      ingestAll: vi.fn().mockResolvedValue([
        { name: 'payments', rows: 100 },
        { name: 'contracts', rows: 50 },
        { name: 'placements', rows: 75 },
      ]),
    }

    mockJobsService = {
      getLastSuccessfulJob: vi.fn().mockResolvedValue(null),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestMisHandler,
        { provide: MisService, useValue: mockMisService },
        { provide: JobsService, useValue: mockJobsService },
      ],
    }).compile()

    handler = module.get<IngestMisHandler>(IngestMisHandler)
  })

  it('should have jobType INGEST_MIS', () => {
    expect(handler.jobType).toBe(JobType.INGEST_MIS)
  })

  describe('execute', () => {
    it('should delegate to MisService when no previous run exists', async () => {
      const result = await handler.execute(mockContext)

      expect(mockMisService.readLastUpdated).toHaveBeenCalledTimes(1)
      expect(mockMisService.ingestAll).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
    })

    it('should aggregate total rows from all files', async () => {
      const result = await handler.execute(mockContext)

      expect(result.metadata?.totalRows).toBe(225)
      expect(result.message).toContain('225 rows')
      expect(result.message).toContain('3 files')
    })

    it('should propagate errors from MisService', async () => {
      mockMisService.ingestAll.mockRejectedValue(new Error('payments: CSV has no data rows'))

      await expect(handler.execute(mockContext)).rejects.toThrow('CSV has no data rows')
    })

    it('should skip ingestion when lastUpdated matches previous run', async () => {
      mockJobsService.getLastSuccessfulJob.mockResolvedValue({
        id: 1,
        metadata: { lastUpdated: '20260221' },
      })

      const result = await handler.execute(mockContext)

      expect(mockMisService.readLastUpdated).toHaveBeenCalledTimes(1)
      expect(mockMisService.ingestAll).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.metadata?.skipped).toBe(true)
      expect(result.message).toContain('skipped')
      expect(result.message).toContain('20260221')
    })

    it('should proceed with ingestion when lastUpdated differs from previous run', async () => {
      mockJobsService.getLastSuccessfulJob.mockResolvedValue({
        id: 1,
        metadata: { lastUpdated: '20260220' },
      })

      const result = await handler.execute(mockContext)

      expect(mockMisService.ingestAll).toHaveBeenCalledTimes(1)
      expect(result.metadata?.skipped).toBeUndefined()
      expect(result.metadata?.totalRows).toBe(225)
    })

    it('should proceed with ingestion when lastUpdated is null', async () => {
      mockMisService.readLastUpdated.mockResolvedValue(null)

      const result = await handler.execute(mockContext)

      expect(mockMisService.ingestAll).toHaveBeenCalledTimes(1)
      expect(result.metadata?.totalRows).toBe(225)
    })

    it('should proceed when previous run has no lastUpdated in metadata', async () => {
      mockJobsService.getLastSuccessfulJob.mockResolvedValue({
        id: 1,
        metadata: {},
      })

      const result = await handler.execute(mockContext)

      expect(mockMisService.ingestAll).toHaveBeenCalledTimes(1)
      expect(result.metadata?.totalRows).toBe(225)
    })

    it('should proceed when previous run metadata is null', async () => {
      mockJobsService.getLastSuccessfulJob.mockResolvedValue({
        id: 1,
        metadata: null,
      })

      const result = await handler.execute(mockContext)

      expect(mockMisService.ingestAll).toHaveBeenCalledTimes(1)
      expect(result.metadata?.totalRows).toBe(225)
    })
  })
})
