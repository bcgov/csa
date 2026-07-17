import { Test, TestingModule } from '@nestjs/testing'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { BackfillIcmCaseCloseDatesHandler } from './backfill-icm-case-close-dates.handler'
import { IcmService } from '../icm/icm.service'

const mockContext: JobContext = {
  jobRunId: 1,
  jobType: JobType.BACKFILL_ICM_CASE_CLOSE_DATES,
  jobTrigger: JobTrigger.END_USER,
  retryCount: 0,
}

describe('BackfillIcmCaseCloseDatesHandler', () => {
  let handler: BackfillIcmCaseCloseDatesHandler
  let mockIcmService: { ingestResource: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockIcmService = {
      ingestResource: vi.fn().mockResolvedValue({
        name: 'cases',
        fetched: 100,
        upserted: 100,
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackfillIcmCaseCloseDatesHandler,
        { provide: IcmService, useValue: mockIcmService },
      ],
    }).compile()

    handler = module.get<BackfillIcmCaseCloseDatesHandler>(BackfillIcmCaseCloseDatesHandler)
  })

  it('should have jobType BACKFILL_ICM_CASE_CLOSE_DATES', () => {
    expect(handler.jobType).toBe(JobType.BACKFILL_ICM_CASE_CLOSE_DATES)
  })

  describe('execute', () => {
    it('should full-load cases without incremental cursor', async () => {
      const result = await handler.execute(mockContext)

      expect(result.success).toBe(true)
      expect(result.metadata?.lastUpdated).toBeNull()
      expect(result.message).toContain('100 fetched')

      expect(mockIcmService.ingestResource).toHaveBeenCalledTimes(1)
      expect(mockIcmService.ingestResource).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'cases' }),
        undefined,
      )
    })
  })
})
