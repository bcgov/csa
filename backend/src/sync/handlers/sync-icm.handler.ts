import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'

// Pushes eligibility status and other updates back to ICM
@Injectable()
export class SyncIcmHandler extends BaseJob {
  readonly jobType = JobType.SYNC_ICM

  async execute(context: JobContext): Promise<JobResult> {
    // TODO: Implement ICM sync logic

    this.logger.log('SYNC_ICM stub - not yet implemented')

    return {
      success: true,
      message: 'ICM sync stub',
      metadata: {
        records_synced: 0,
        failures: 0,
      },
    }
  }
}
