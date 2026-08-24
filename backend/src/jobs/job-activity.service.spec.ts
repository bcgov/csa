import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { JobActivitySeverity } from './enums/job-activity-severity.enum'
import { JobActivityType } from './enums/job-activity-type.enum'
import { JobActivityService } from './job-activity.service'
import { JobsService } from './jobs.service'

describe('JobActivityService', () => {
  let service: JobActivityService
  let jobsService: JobsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobActivityService,
        {
          provide: JobsService,
          useValue: { addActivity: vi.fn().mockResolvedValue({ id: 1 }) },
        },
      ],
    }).compile()

    service = module.get(JobActivityService)
    jobsService = module.get(JobsService)
  })

  it('records activity via JobsService', async () => {
    await service.recordActivity({
      jobRunId: 5,
      severity: JobActivitySeverity.CRITICAL,
      activityType: JobActivityType.DATA_QUALITY,
      related: '3 contacts skipped',
    })

    expect(jobsService.addActivity).toHaveBeenCalledWith(5, {
      severity: JobActivitySeverity.CRITICAL,
      type: JobActivityType.DATA_QUALITY,
      related: '3 contacts skipped',
    })
  })

  it('truncates long related text', async () => {
    const longText = 'x'.repeat(600)

    await service.recordActivity({
      jobRunId: 1,
      severity: JobActivitySeverity.ERROR,
      activityType: JobActivityType.JOB,
      related: longText,
    })

    expect(jobsService.addActivity).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        related: 'x'.repeat(512),
      }),
    )
  })
})
