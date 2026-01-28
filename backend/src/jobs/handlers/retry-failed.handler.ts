import { Injectable } from '@nestjs/common'
import { BaseJob } from '../base-job'
import { JobType } from '../enums/job-type.enum'
import { JobResult } from '../interfaces/job-result.interface'
import { JobContext } from '../interfaces/job.interface'
import { JobRunner } from '../job-runner.service'

/*
 * RETRY_FAILED - Retry failed jobs
 * 1. Marks stuck RUNNING jobs as FAILED
 * 2. Retries all FAILED jobs
 */
@Injectable()
export class RetryFailedHandler extends BaseJob {
  readonly jobType = JobType.RETRY_FAILED

  constructor(private readonly jobRunner: JobRunner) {
    super()
  }

  async execute(context: JobContext): Promise<JobResult> {
    try {
      // This handles both stuck job detection and retry logic
      await this.jobRunner.processFailedJobs()

      return {
        success: true,
        message: 'Failed job processing completed',
      }
    } catch (error) {
      this.logger.error(`Error processing failed jobs: ${error.message}`, error.stack)
      return {
        success: false,
        message: error.message,
        metadata: {
          errorStack: error.stack,
          errorName: error.name,
        },
      }
    }
  }
}
