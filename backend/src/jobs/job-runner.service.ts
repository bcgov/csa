import { Injectable, Logger } from '@nestjs/common'
import { JobRun, Prisma } from '@prisma/client'
import { JobTrigger } from './enums/job-trigger.enum'
import { JobType } from './enums/job-type.enum'
import { JobResult } from './interfaces/job-result.interface'
import { JobContext } from './interfaces/job.interface'
import { JobRegistry } from './job-registry.service'
import { JobsService } from './jobs.service'
import { OpenshiftJobLauncher } from './openshift-job-launcher.service'

@Injectable()
export class JobRunner {
  private readonly logger = new Logger(JobRunner.name)

  constructor(
    private readonly jobsService: JobsService,
    private readonly jobRegistry: JobRegistry,
    private readonly openshiftJobLauncher: OpenshiftJobLauncher,
  ) {}

  private async reconcileStuckRunningJobs(stuckThresholdMinutes: number): Promise<number> {
    const stuckJobs = await this.jobsService.getStuckRunningJobs(stuckThresholdMinutes)
    let markedFailed = 0

    for (const job of stuckJobs) {
      const jobType = job.jobType as JobType

      // For non-OpenShift-managed jobs, keep the classic timeout behavior.
      if (!this.openshiftJobLauncher.hasCronJobMapping(jobType)) {
        await this.jobsService.markStuckJobAsFailed(job.id)
        markedFailed += 1
        continue
      }

      const openshiftStatus = await this.openshiftJobLauncher.getJobStatus(jobType, job.id)

      if (openshiftStatus.state === 'ACTIVE') {
        this.logger.log(
          `Skipping stuck mark for job ${job.id} [${jobType}] because OpenShift still reports ACTIVE`,
        )
        continue
      }

      const reason =
        openshiftStatus.state === 'FAILED'
          ? `OpenShift job failed: ${openshiftStatus.message}`
          : `Job timed out (stuck): OpenShift state=${openshiftStatus.state.toLowerCase()}`

      await this.jobsService.markStuckJobAsFailed(job.id, reason)
      markedFailed += 1
    }

    return markedFailed
  }

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

    try {
      await handler.onStart?.(context)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.logger.error(`Job ${jobId} onStart hook failed: ${err.message}`, err.stack)
      await this.safeMarkFailed(jobId, err)
      return { success: false, message: `onStart failed: ${err.message}` }
    }

    // Inline retry loop
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= handler.inlineRetryAttempts; attempt++) {
      try {
        if (attempt > 0) {
          this.logger.log(`Inline retry attempt ${attempt} for job ${jobId}`)
          // Exponential backoff: 2s, 4s, 8s
          await this.sleep(2000 * Math.pow(2, attempt - 1))
        }

        const result = await handler.execute(context)

        if (result.success) {
          await this.jobsService.markSuccess(jobId, result.metadata)
          try {
            await handler.onSuccess?.(context, result)
          } catch (hookError) {
            const err = hookError instanceof Error ? hookError : new Error(String(hookError))
            this.logger.error(`Job ${jobId} onSuccess hook threw: ${err.message}`, err.stack)
          }
          return result
        } else {
          lastError = new Error(result.message || 'Job execution returned unsuccessful result')
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        this.logger.error(
          `Job ${jobId} attempt ${attempt + 1}/${handler.inlineRetryAttempts + 1} failed: ${lastError.message}`,
          lastError.stack,
        )
      }
    }

    // All inline retries exhausted - mark as failed
    await this.safeMarkFailed(jobId, lastError!)

    try {
      await handler.onFailure?.(context, lastError!)
    } catch (hookError) {
      const err = hookError instanceof Error ? hookError : new Error(String(hookError))
      this.logger.error(`Job ${jobId} onFailure hook threw: ${err.message}`, err.stack)
    }

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
    let jobRun: JobRun
    try {
      jobRun = await this.jobsService.createJob({
        jobType,
        jobTrigger,
        parentJobId: options?.parentJobId,
        metadata: options?.metadata,
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.warn(`Job ${jobType} is already running, skipping`)
        return { success: false, message: `Job ${jobType} is already running` }
      }
      throw error
    }

    this.logger.log(`Created job run ${jobRun.id} for ${jobType}`)

    return this.executeJob(jobRun.id)
  }

  // Process failed jobs and stuck running jobs
  async processFailedJobs(): Promise<void> {
    let stuckCount = 0
    if (this.openshiftJobLauncher.isEnabled()) {
      stuckCount = await this.reconcileStuckRunningJobs(40)
    } else {
      const stuckResult = await this.jobsService.markStuckJobsAsFailed(40)
      stuckCount = stuckResult.count
    }

    if (stuckCount > 0) {
      this.logger.log(`Marked ${stuckCount} stuck jobs as FAILED`)
    }

    // Only returns top-level jobs under MAX_RETRY_COUNT (child jobs excluded)
    const failedJobs = await this.jobsService.getFailedJobs()
    this.logger.log(`Found ${failedJobs.length} retryable failed jobs`)

    for (const job of failedJobs) {
      try {
        this.logger.log(
          `Retrying job ${job.id} [${job.jobType}] (retry #${(job.retryCount ?? 0) + 1})`,
        )

        await this.jobsService.resetToRunning(job.id)
        await this.executeJob(job.id)
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          this.logger.warn(`Job ${job.jobType} is already running, skipping retry of job ${job.id}`)
          continue
        }
        this.logger.error(`Error retrying job ${job.id}: ${error}`)
      }
    }
  }

  private async safeMarkFailed(jobId: number, error: Error): Promise<void> {
    const errorDetail = error.stack || error.message
    try {
      await this.jobsService.markFailed(jobId, errorDetail)
    } catch (dbError) {
      this.logger.error(
        `Failed to mark job ${jobId} as FAILED in DB: ${dbError}. Original error: ${errorDetail}`,
      )
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
