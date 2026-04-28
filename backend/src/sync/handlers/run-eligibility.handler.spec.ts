import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { RunEligibilityHandler } from './run-eligibility.handler'
import { EligibilityService } from '../eligibility/eligibility.service'
import { IcmSyncBackService } from '../icm/icm-sync-back.service'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobsService } from 'src/jobs/jobs.service'

const mockContext: JobContext = {
  jobRunId: 1,
  jobType: JobType.RUN_ELIGIBILITY,
  jobTrigger: JobTrigger.CRON,
  retryCount: 0,
}

const mockEligibilityResult = {
  processed: 100,
  statusChanges: 25,
  newContacts: 10,
  skipped: 0,
  stepCounts: { step7: 15, step8: 5, step9: 3, step10: 2, noChange: 25 },
}

describe('RunEligibilityHandler', () => {
  let handler: RunEligibilityHandler
  let mockEligibilityService: { run: ReturnType<typeof vi.fn> }
  let mockSyncBackService: { syncFlaggedWithRetry: ReturnType<typeof vi.fn> }
  let mockJobsService: { getLastSuccessTimestamp: ReturnType<typeof vi.fn> }
  let mockConfigService: { get: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockEligibilityService = {
      run: vi.fn().mockResolvedValue(mockEligibilityResult),
    }
    mockSyncBackService = {
      syncFlaggedWithRetry: vi
        .fn()
        .mockResolvedValue({ totalFlagged: 5, synced: 5, failed: 0, chunks: 1 }),
    }
    mockJobsService = {
      getLastSuccessTimestamp: vi.fn().mockResolvedValue(null), // default: full load
    }
    mockConfigService = {
      get: vi.fn().mockReturnValue(2), // lookback days
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunEligibilityHandler,
        { provide: EligibilityService, useValue: mockEligibilityService },
        { provide: IcmSyncBackService, useValue: mockSyncBackService },
        { provide: JobsService, useValue: mockJobsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile()

    handler = module.get<RunEligibilityHandler>(RunEligibilityHandler)
  })

  it('should have jobType RUN_ELIGIBILITY', () => {
    expect(handler.jobType).toBe(JobType.RUN_ELIGIBILITY)
  })

  it('should run eligibility then sync-back and return success', async () => {
    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(result.message).toContain('100 processed')
    expect(result.message).toContain('25 updated')
    expect(mockEligibilityService.run).toHaveBeenCalledWith(null) // null = full load (no prior success)
    expect(mockSyncBackService.syncFlaggedWithRetry).toHaveBeenCalledOnce()
    expect(result.metadata).toHaveProperty('stepCounts')
    expect(result.metadata).toHaveProperty('syncResult')
  })

  it('should succeed even if sync-back throws', async () => {
    mockSyncBackService.syncFlaggedWithRetry.mockRejectedValue(new Error('ICM API down'))

    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(mockEligibilityService.run).toHaveBeenCalledWith(null)
    expect(result.metadata).toMatchObject({ syncResult: null })
  })
})
