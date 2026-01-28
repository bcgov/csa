import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'

// Runs after INGEST_ICM and INGEST_MIS complete
@Injectable()
export class RunEligibilityHandler extends BaseJob {
  readonly jobType = JobType.RUN_ELIGIBILITY

  async execute(_context: JobContext): Promise<JobResult> {
    // TODO: Implement eligibility logic

    this.logger.log('RUN_ELIGIBILITY stub - not yet implemented')

    return {
      success: true,
      message: 'Eligibility processing stub',
      metadata: {
        contacts_eligible: 0,
        contacts_excluded: 0,
      },
    }
  }
}
