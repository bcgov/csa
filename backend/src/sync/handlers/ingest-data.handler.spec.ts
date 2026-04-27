import { Test, TestingModule } from '@nestjs/testing'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobRunner } from 'src/jobs/job-runner.service'
import { IngestDataHandler } from './ingest-data.handler'

describe('IngestDataHandler', () => {
  let handler: IngestDataHandler
  let jobRunner: JobRunner

  const mockContext: JobContext = {
    jobRunId: 1,
    jobType: JobType.INGEST_DATA,
    jobTrigger: JobTrigger.CRON,
    retryCount: 0,
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestDataHandler,
        {
          provide: JobRunner,
          useValue: { runJobType: vi.fn() },
        },
      ],
    }).compile()

    handler = module.get<IngestDataHandler>(IngestDataHandler)
    jobRunner = module.get<JobRunner>(JobRunner)
  })

  it('should be defined with correct jobType', () => {
    expect(handler).toBeDefined()
    expect(handler.jobType).toBe(JobType.INGEST_DATA)
  })

  describe('successful execution', () => {
    it('should run ICM and MIS ingestion in parallel and return success', async () => {
      const runJobTypeSpy = vi.mocked(jobRunner.runJobType)
      runJobTypeSpy.mockResolvedValue({ success: true })

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.message).toBe('Data ingestion completed successfully')
      expect(runJobTypeSpy).toHaveBeenCalledTimes(2)
      expect(runJobTypeSpy).toHaveBeenCalledWith(JobType.INGEST_ICM, JobTrigger.CRON, {
        parentJobId: 1,
      })
      expect(runJobTypeSpy).toHaveBeenCalledWith(JobType.INGEST_MIS, JobTrigger.CRON, {
        parentJobId: 1,
      })
    })
  })

  describe('failure scenarios', () => {
    it('should fail if ICM ingestion fails', async () => {
      const runJobTypeSpy = vi.mocked(jobRunner.runJobType)
      runJobTypeSpy
        .mockResolvedValueOnce({ success: false, message: 'ICM connection failed' })
        .mockResolvedValueOnce({ success: true })

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Ingestion failed')
      expect(result.metadata).toEqual({
        icmResult: { success: false, message: 'ICM connection failed' },
        misResult: { success: true },
      })
      expect(runJobTypeSpy).toHaveBeenCalledTimes(2)
    })

    it('should fail if MIS ingestion fails', async () => {
      const runJobTypeSpy = vi.mocked(jobRunner.runJobType)
      runJobTypeSpy
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, message: 'MIS timeout' })

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Ingestion failed')
    })
  })
})
