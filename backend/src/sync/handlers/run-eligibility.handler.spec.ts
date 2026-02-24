import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { RunEligibilityHandler } from './run-eligibility.handler'
import { EligibilityService } from '../eligibility/eligibility.service'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'

const mockContext: JobContext = {
  jobRunId: 1,
  jobType: JobType.RUN_ELIGIBILITY,
  jobTrigger: JobTrigger.CRON,
  retryCount: 0,
}

describe('RunEligibilityHandler', () => {
  let handler: RunEligibilityHandler
  let mockEligibilityService: { run: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockEligibilityService = {
      run: vi.fn().mockResolvedValue({
        processed: 100,
        statusChanges: 25,
        newContacts: 10,
        skipped: 0,
        autoBatched: { application: 12, cancellation: 3 },
        stepCounts: { step7: 15, step8: 5, step9: 3, step10: 2, noChange: 25 },
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunEligibilityHandler,
        { provide: EligibilityService, useValue: mockEligibilityService },
      ],
    }).compile()

    handler = module.get<RunEligibilityHandler>(RunEligibilityHandler)
  })

  it('should have jobType RUN_ELIGIBILITY', () => {
    expect(handler.jobType).toBe(JobType.RUN_ELIGIBILITY)
  })

  it('should delegate to EligibilityService and return result', async () => {
    const result = await handler.execute(mockContext)

    expect(result.success).toBe(true)
    expect(result.message).toContain('100 processed')
    expect(result.message).toContain('25 updated')
    expect(result.metadata).toHaveProperty('stepCounts')
    expect(mockEligibilityService.run).toHaveBeenCalledOnce()
  })
})
