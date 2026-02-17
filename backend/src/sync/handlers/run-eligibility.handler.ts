import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { EligibilityService } from '../eligibility/eligibility.service'

@Injectable()
export class RunEligibilityHandler extends BaseJob {
  readonly jobType = JobType.RUN_ELIGIBILITY

  constructor(private readonly eligibilityService: EligibilityService) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    const result = await this.eligibilityService.run()

    return {
      success: true,
      message: `Eligibility complete: ${result.processed} processed, ${result.statusChanges} updated, ${result.autoBatched.application} batched (application), ${result.autoBatched.cancellation} batched (cancellation)`,
      metadata: result as unknown as Record<string, unknown>,
    }
  }
}
