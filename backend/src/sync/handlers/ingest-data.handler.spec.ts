import { Test, TestingModule } from '@nestjs/testing'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobRunner } from 'src/jobs/job-runner.service'
import { IcmSyncBackService } from '../icm/icm-sync-back.service'
import { IngestDataHandler } from './ingest-data.handler'

describe('IngestDataHandler', () => {
  let handler: IngestDataHandler
  let jobRunner: JobRunner
  let icmSyncBackService: {
    syncFlaggedWithRetry: ReturnType<typeof vi.fn>
  }

  const mockContext: JobContext = {
    jobRunId: 1,
    jobType: JobType.INGEST_DATA,
    jobTrigger: JobTrigger.CRON,
    retryCount: 0,
  }

  beforeEach(async () => {
    icmSyncBackService = {
      syncFlaggedWithRetry: vi
        .fn()
        .mockResolvedValue({ totalFlagged: 0, synced: 0, failed: 0, chunks: 0 }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestDataHandler,
        {
          provide: JobRunner,
          useValue: {
            runJobType: vi.fn(),
          },
        },
        {
          provide: IcmSyncBackService,
          useValue: icmSyncBackService,
        },
      ],
    }).compile()

    handler = module.get<IngestDataHandler>(IngestDataHandler)
    jobRunner = module.get<JobRunner>(JobRunner)
  })

  it('should be defined', () => {
    expect(handler).toBeDefined()
    expect(handler.jobType).toBe(JobType.INGEST_DATA)
  })

  describe('successful execution', () => {
    it('should orchestrate all jobs in correct order', async () => {
      const runJobTypeSpy = vi.mocked(jobRunner.runJobType)
      runJobTypeSpy.mockResolvedValue({ success: true })

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.message).toBe('Data ingestion and eligibility completed successfully')

      // Verify execution order (ICM + MIS parallel, then eligibility)
      expect(runJobTypeSpy).toHaveBeenNthCalledWith(1, JobType.INGEST_ICM, JobTrigger.CRON, {
        parentJobId: 1,
      })
      expect(runJobTypeSpy).toHaveBeenNthCalledWith(2, JobType.INGEST_MIS, JobTrigger.CRON, {
        parentJobId: 1,
      })
      expect(runJobTypeSpy).toHaveBeenNthCalledWith(3, JobType.RUN_ELIGIBILITY, JobTrigger.CRON, {
        parentJobId: 1,
      })
      expect(runJobTypeSpy).toHaveBeenCalledTimes(3)

      // Verify inline sync was called
      expect(icmSyncBackService.syncFlaggedWithRetry).toHaveBeenCalled()
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

      // Should not proceed to eligibility or sync
      expect(runJobTypeSpy).toHaveBeenCalledTimes(2) // Only ICM + MIS
    })

    it('should fail if MIS ingestion fails', async () => {
      const runJobTypeSpy = vi.mocked(jobRunner.runJobType)
      runJobTypeSpy
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, message: 'MIS timeout' })

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Ingestion failed')
      expect(result.metadata).toEqual({
        icmResult: { success: true },
        misResult: { success: false, message: 'MIS timeout' },
      })
    })

    it('should fail if eligibility processing fails', async () => {
      const runJobTypeSpy = vi.mocked(jobRunner.runJobType)
      runJobTypeSpy
        .mockResolvedValueOnce({ success: true }) // ICM
        .mockResolvedValueOnce({ success: true }) // MIS
        .mockResolvedValueOnce({ success: false, message: 'Eligibility rules error' }) // Eligibility

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Eligibility processing failed')
      expect(result.metadata).toEqual({
        eligibilityResult: { success: false, message: 'Eligibility rules error' },
      })

      // Should not proceed to sync
      expect(runJobTypeSpy).toHaveBeenCalledTimes(3)
    })

    it('should skip sync when no contacts are flagged', async () => {
      icmSyncBackService.syncFlaggedWithRetry.mockResolvedValue(null)
      const runJobTypeSpy = vi.mocked(jobRunner.runJobType)
      runJobTypeSpy
        .mockResolvedValueOnce({ success: true }) // ICM
        .mockResolvedValueOnce({ success: true }) // MIS
        .mockResolvedValueOnce({ success: true }) // Eligibility

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata).toEqual({ syncResult: null })
      expect(runJobTypeSpy).toHaveBeenCalledTimes(3)
    })

    it('should succeed even if sync-back throws', async () => {
      icmSyncBackService.syncFlaggedWithRetry.mockRejectedValue(new Error('ICM API down'))
      const runJobTypeSpy = vi.mocked(jobRunner.runJobType)
      runJobTypeSpy
        .mockResolvedValueOnce({ success: true }) // ICM
        .mockResolvedValueOnce({ success: true }) // MIS
        .mockResolvedValueOnce({ success: true }) // Eligibility

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.message).toBe('Data ingestion and eligibility completed successfully')
    })

    it('should handle unexpected errors with stack trace', async () => {
      const error = new Error('Unexpected database error')
      error.stack = 'Error: Unexpected database error\n  at ...'

      vi.mocked(jobRunner.runJobType).mockRejectedValue(error)

      const result = await handler.execute(mockContext)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Unexpected database error')
      expect(result.metadata).toEqual({
        errorStack: error.stack,
        errorName: 'Error',
      })
    })
  })
})
