import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobResult } from './job-result.interface'

export interface JobContext {
  jobRunId: number
  parentJobId?: number
  jobType: JobType
  jobTrigger: JobTrigger
  retryCount: number
  metadata?: Record<string, unknown>
}

export interface Job {
  readonly jobType: JobType
  readonly inlineRetryAttempts: number
  execute(context: JobContext): Promise<JobResult>
  onStart?(context: JobContext): Promise<void>
  onSuccess?(context: JobContext, result: JobResult): Promise<void>
  onFailure?(context: JobContext, error: Error): Promise<void>
}
