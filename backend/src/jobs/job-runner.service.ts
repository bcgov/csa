import { Injectable, Logger } from '@nestjs/common'
import { JobTrigger } from './enums/job-trigger.enum'
import { JobType } from './enums/job-type.enum'
import { JobResult } from './interfaces/job-result.interface'
import { JobContext } from './interfaces/job.interface'
import { JobRegistry } from './job-registry.service'
import { JobsService } from './jobs.service'

@Injectable()
export class JobRunner {
  private readonly logger = new Logger(JobRunner.name)

  constructor(
    private readonly jobsService: JobsService,
    private readonly jobRegistry: JobRegistry,
  ) {}

  // Execute a job with inline retry
  async executeJob(jobId: number): Promise<JobResult> {
    const job = await this.jobsService.getJob(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    const handler = this.jobRegistry.getHandler(job.jobType as JobType)

    if (!handler) {
      const errorMsg = `No handler registered for job type: ${job.jobType}`
      await this.jobsService.markFailed(jobId, errorMsg)
      throw new Error(errorMsg)
    }

    const context: JobContext = {
      jobRunId: job.id,
      parentJobId: job.parentJobId ?? undefined,
      jobType: job.jobType as JobType,
      jobTrigger: job.jobTrigger as JobTrigger,
      retryCount: job.retryCount ?? 0,
      metadata: job.metadata as Record<string, unknown> | undefined,
    }

    await handler.onStart?.(context)

    // Inline retry loop
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= handler.inlineRetryAttempts; attempt++) {
      try {
        if (attempt > 0) {
          this.logger.log(`Inline retry attempt ${attempt} for job ${jobId}`)
          // Short delay between inline retries (exponential: 1s, 2s, 4s)
          // TODO: to increase ?
          await this.sleep(1000 * Math.pow(2, attempt - 1))
        }

        const result = await handler.execute(context)

        if (result.success) {
          await this.jobsService.markSuccess(jobId, result.metadata)
          await handler.onSuccess?.(context, result)
          return result
        } else {
          lastError = new Error(result.message || 'Job execution returned unsuccessful result')
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        this.logger.warn(
          `Job ${jobId} inline attempt ${attempt + 1} failed: ${lastError.message} stack:${error?.stack}`,
        )
      }
    }

    // All inline retries exhausted - mark as failed
    await this.jobsService.markFailed(jobId, lastError!.message)
    await handler.onFailure?.(context, lastError!)

    return {
      success: false,
      message: `Failed after ${handler.inlineRetryAttempts + 1} attempts: ${lastError!.message}`,
    }
  }

  async runJobType(
    jobType: JobType,
    jobTrigger: JobTrigger,
    options?: {
      parentJobId?: number
      metadata?: Record<string, unknown>
    },
  ): Promise<JobResult> {
    const handler = this.jobRegistry.getHandler(jobType)
    if (!handler) {
      throw new Error(`No handler registered for job type: ${jobType}`)
    }

    // Create a new job run record (starts as RUNNING)
    const jobRun = await this.jobsService.createJob({
      jobType,
      jobTrigger,
      parentJobId: options?.parentJobId,
      metadata: options?.metadata,
    })

    this.logger.log(`Created job run ${jobRun.id} for ${jobType}`)

    return this.executeJob(jobRun.id)
  }

  // Process failed jobs and stuck running jobs
  // TODO: define when to consider jobs as failed
  async processFailedJobs(): Promise<void> {
    // First, mark stuck RUNNING jobs as FAILED
    const stuckResult = await this.jobsService.markStuckJobsAsFailed(60) // 1 hour threshold
    if (stuckResult.count > 0) {
      this.logger.log(`Marked ${stuckResult.count} stuck jobs as FAILED`)
    }

    // Then, retry all FAILED jobs
    const failedJobs = await this.jobsService.getFailedJobs()
    this.logger.log(`Found ${failedJobs.length} failed jobs to retry`)

    for (const job of failedJobs) {
      try {
        this.logger.log(`Retrying job ${job.id} [${job.jobType}]`)

        // Re-run the job (creates a new job run)
        await this.runJobType(job.jobType as JobType, job.jobTrigger as JobTrigger, {
          parentJobId: job.parentJobId ?? undefined,
          metadata: job.metadata as Record<string, unknown>,
        })
      } catch (error) {
        this.logger.error(`Error retrying job ${job.id}: ${error}`)
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
