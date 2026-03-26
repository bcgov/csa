import { AppLogger } from 'src/common/logger/app-logger'
import { JobType } from './enums/job-type.enum'
import { JobResult } from './interfaces/job-result.interface'
import { Job, JobContext } from './interfaces/job.interface'

export abstract class BaseJob implements Job {
  protected readonly logger: AppLogger

  abstract readonly jobType: JobType
  readonly inlineRetryAttempts: number = 2

  constructor() {
    this.logger = new AppLogger(this.constructor.name)
  }

  abstract execute(context: JobContext): Promise<JobResult>

  async onStart(context: JobContext): Promise<void> {
    this.logger.log(`Starting job ${context.jobRunId} [${this.jobType}]`)
  }

  async onSuccess(context: JobContext, result: JobResult): Promise<void> {
    this.logger.log(`Job ${context.jobRunId} completed successfully: ${result.message ?? 'OK'}`)
  }

  async onFailure(context: JobContext, error: Error): Promise<void> {
    this.logger.crit(
      `Job ${context.jobRunId} failed after ${context.retryCount + 1} attempt(s): ${error.message}`,
      { jobRunId: context.jobRunId, jobType: this.jobType },
    )
  }
}
