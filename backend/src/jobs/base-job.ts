import { Logger } from '@nestjs/common'
import { JobType } from './enums/job-type.enum'
import { JobResult } from './interfaces/job-result.interface'
import { Job, JobContext } from './interfaces/job.interface'

export abstract class BaseJob implements Job {
  protected readonly logger: Logger

  abstract readonly jobType: JobType
  readonly inlineRetryAttempts: number = 2

  constructor() {
    this.logger = new Logger(this.constructor.name)
  }

  abstract execute(context: JobContext): Promise<JobResult>

  async onStart(context: JobContext): Promise<void> {
    this.logger.log(`Starting job ${context.jobRunId} [${this.jobType}]`)
  }

  async onSuccess(context: JobContext, result: JobResult): Promise<void> {
    this.logger.log(`Job ${context.jobRunId} completed successfully: ${result.message ?? 'OK'}`)
  }

  async onFailure(context: JobContext, error: Error): Promise<void> {
    this.logger.warn(
      `Job ${context.jobRunId} failed (attempt ${context.retryCount + 1}): ${error.message}`,
    )
  }
}
