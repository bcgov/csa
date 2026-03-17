import { Test, TestingModule } from '@nestjs/testing'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { IcmSyncBackService } from 'src/sync/icm/icm-sync-back.service'
import { RetryFailedHandler } from './retry-failed.handler'
import { JobRunner } from '../job-runner.service'

describe('RetryFailedHandler', () => {
  let handler: RetryFailedHandler
  let jobRunner: { processFailedJobs: ReturnType<typeof vi.fn> }
  let icmSyncBackService: {
    hasFlaggedContacts: ReturnType<typeof vi.fn>
    syncFlaggedContacts: ReturnType<typeof vi.fn>
  }

  const mockContext: JobContext = {
    jobRunId: 1,
    jobType: JobType.RETRY_FAILED,
    jobTrigger: JobTrigger.CRON,
    retryCount: 0,
  }

  beforeEach(async () => {
    jobRunner = {
      processFailedJobs: vi.fn().mockResolvedValue(undefined),
    }

    icmSyncBackService = {
      hasFlaggedContacts: vi.fn().mockResolvedValue(false),
      syncFlaggedContacts: vi
        .fn()
        .mockResolvedValue({ totalFlagged: 0, synced: 0, failed: 0, chunks: 0 }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetryFailedHandler,
        { provide: JobRunner, useValue: jobRunner },
        { provide: IcmSyncBackService, useValue: icmSyncBackService },
      ],
    }).compile()

    handler = module.get<RetryFailedHandler>(RetryFailedHandler)
  })

  it('should be defined', () => {
    expect(handler).toBeDefined()
    expect(handler.jobType).toBe(JobType.RETRY_FAILED)
  })

  it('should call processFailedJobs first', async () => {
    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(jobRunner.processFailedJobs).toHaveBeenCalled()
  })

  it('should sweep flagged contacts when present', async () => {
    icmSyncBackService.hasFlaggedContacts.mockResolvedValue(true)
    icmSyncBackService.syncFlaggedContacts.mockResolvedValue({
      totalFlagged: 3,
      synced: 3,
      failed: 0,
      chunks: 1,
    })

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(icmSyncBackService.syncFlaggedContacts).toHaveBeenCalled()
    expect(result.metadata).toEqual({
      syncResult: { totalFlagged: 3, synced: 3, failed: 0, chunks: 1 },
    })
  })

  it('should not call syncFlaggedContacts when no contacts are flagged', async () => {
    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(icmSyncBackService.syncFlaggedContacts).not.toHaveBeenCalled()
    expect(result.metadata).toEqual({ syncResult: null })
  })

  it('should still succeed on partial sync failure', async () => {
    icmSyncBackService.hasFlaggedContacts.mockResolvedValue(true)
    icmSyncBackService.syncFlaggedContacts.mockResolvedValue({
      totalFlagged: 10,
      synced: 7,
      failed: 3,
      chunks: 1,
    })

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(result.metadata).toEqual({
      syncResult: { totalFlagged: 10, synced: 7, failed: 3, chunks: 1 },
    })
  })

  it('should return failure when processFailedJobs throws', async () => {
    const error = new Error('Database connection lost')
    error.stack = 'Error: Database connection lost\n  at ...'
    jobRunner.processFailedJobs.mockRejectedValue(error)

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(false)
    expect(result.message).toBe('Database connection lost')
    expect(result.metadata).toEqual({
      errorStack: error.stack,
      errorName: 'Error',
    })
  })
})
