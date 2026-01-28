import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'

/*
 * Checks for response files from CRA and processes them
 * Triggered by CronJob POLL_CRA_RESPONSE
 */
@Injectable()
export class PollCraResponseHandler extends BaseJob {
  readonly jobType = JobType.POLL_CRA_RESPONSE

  async execute(context: JobContext): Promise<JobResult> {
    // TODO: Implement CRA response polling
    // 1. Poll CRA endpoint for response files
    // 2. Download new response files
    // 3. Parse and validate response data
    // 4. Update contact records with CRA responses
    // 5. Return metadata: { files_processed, records_updated, errors }

    this.logger.log('POLL_CRA_RESPONSE stub - not yet implemented')

    return {
      success: true,
      message: 'CRA response polling stub',
      metadata: {
        files_processed: 0,
        records_updated: 0,
        errors: [],
      },
    }
  }
}
