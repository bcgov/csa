import {
  ConflictException,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Prisma } from '@prisma/client'
import { JobStatus } from 'src/jobs/enums/job-status.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobRunner } from 'src/jobs/job-runner.service'
import { JobsService } from 'src/jobs/jobs.service'
import { OpenshiftJobLauncher } from 'src/jobs/openshift-job-launcher.service'
import { CSAGuard } from '../common/guards/csa.guard'

const PAGE_DEFAULT = 1
const LIMIT_DEFAULT = 20
const LIMIT_MAX = 200
const RUNNING_RECONCILE_THRESHOLD_MS = 40 * 60 * 1000

interface JobRunResponse {
  id: number
  jobType: string
  status: string
  jobTrigger: string
  retryCount: number | null
  error: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
}

function toJobRunResponse(job: {
  id: number
  jobType: string
  status: string
  jobTrigger: string
  retryCount: number | null
  error: string | null
  metadata: unknown
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
}): JobRunResponse {
  return {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    jobTrigger: job.jobTrigger,
    retryCount: job.retryCount,
    error: job.error,
    metadata: (job.metadata as Record<string, unknown> | null) ?? null,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  }
}

@ApiTags('jobs')
@Controller('jobs')
@UseGuards(CSAGuard)
export class JobsController {
  private readonly logger = new Logger(JobsController.name)

  constructor(
    private readonly jobRunner: JobRunner,
    private readonly jobsService: JobsService,
    private readonly openshiftJobLauncher: OpenshiftJobLauncher,
  ) {}

  private isOpenShiftManagedJobType(jobType: string): jobType is JobType {
    return jobType === JobType.RUN_ELIGIBILITY || jobType === JobType.AUTO_BATCH
  }

  private isOlderThanReconcileThreshold(job: { startedAt: Date | null; createdAt: Date }): boolean {
    const startedAtMs = (job.startedAt ?? job.createdAt).getTime()
    return Date.now() - startedAtMs > RUNNING_RECONCILE_THRESHOLD_MS
  }

  // Concurrency: csa.job_runs has a partial unique index on (job_type) WHERE status='RUNNING'
  // so the second concurrent createJob for the same type raises P2002. We translate that to 409.
  private async startFireAndForgetJob(
    jobType: JobType,
  ): Promise<{ jobRunId: number; message: string }> {
    let jobRun
    try {
      jobRun = await this.jobsService.createJob({
        jobType,
        jobTrigger: JobTrigger.END_USER,
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`${jobType} is already running`)
      }
      throw err
    }

    this.jobRunner.executeJob(jobRun.id).catch((err) => {
      this.logger.error(
        `Background local job ${jobRun.id} [${jobType}] crashed: ${(err as Error).message}`,
        (err as Error).stack,
      )
    })

    return {
      jobRunId: jobRun.id,
      message: `OpenShift disabled; running ${jobType} in API process`,
    }
  }

  private async launchOpenShiftJob(
    jobType: JobType,
  ): Promise<{ jobRunId: number; message: string; openshiftJobName?: string }> {
    // Local/dev fallback when OpenShift launcher is disabled
    if (!this.openshiftJobLauncher.isEnabled()) {
      return this.startFireAndForgetJob(jobType)
    }

    // Check if Job is already running in OpenShift BEFORE creating job_runs
    const isRunning = await this.openshiftJobLauncher.isJobRunning(jobType)
    if (isRunning) {
      throw new ConflictException(`${jobType} is already running in OpenShift`)
    }

    let jobRun
    try {
      jobRun = await this.jobsService.createJob({
        jobType,
        jobTrigger: JobTrigger.END_USER,
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`${jobType} is already running`)
      }
      throw err
    }

    this.logger.log(`Created job_run ${jobRun.id} for ${jobType}, launching OpenShift Job...`)

    // Launch OpenShift Job from CronJob template
    const launchResult = await this.openshiftJobLauncher.launchJob(jobType, jobRun.id)

    if (!launchResult.success) {
      this.logger.warn(
        `Failed to launch OpenShift Job for job_run ${jobRun.id}: ${launchResult.message}`,
      )
      await this.jobsService.markFailed(jobRun.id, launchResult.message)
      throw new ServiceUnavailableException(launchResult.message)
    }

    return {
      jobRunId: jobRun.id,
      message: launchResult.message,
      openshiftJobName: launchResult.jobName || undefined,
    }
  }

  @Get()
  @ApiQuery({
    name: 'jobType',
    required: false,
    type: String,
    description: Object.values(JobType).join(' | '),
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: Object.values(JobStatus).join(' | '),
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: `Page number (default: ${PAGE_DEFAULT})`,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: `Items per page (default: ${LIMIT_DEFAULT}, max: ${LIMIT_MAX})`,
  })
  @ApiResponse({ status: 200, description: 'Paginated list of job runs' })
  async listJobs(
    @Query('jobType', new ParseEnumPipe(JobType, { optional: true })) jobType?: JobType,
    @Query('status', new ParseEnumPipe(JobStatus, { optional: true })) status?: JobStatus,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const safePage = page !== undefined && page >= 1 ? page : PAGE_DEFAULT
    const safeLimit = limit !== undefined && limit >= 1 ? Math.min(limit, LIMIT_MAX) : LIMIT_DEFAULT
    const result = await this.jobsService.getJobs({
      jobType,
      status,
      page: safePage,
      limit: safeLimit,
    })
    return {
      data: result.data.map(toJobRunResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    }
  }

  @Post('run-eligibility')
  @ApiResponse({ status: 201, description: 'RUN_ELIGIBILITY job started' })
  @ApiResponse({ status: 409, description: 'RUN_ELIGIBILITY is already running' })
  @ApiResponse({ status: 503, description: 'Failed to launch OpenShift Job' })
  async runEligibility() {
    return this.launchOpenShiftJob(JobType.RUN_ELIGIBILITY)
  }

  @Post('auto-batch')
  @ApiResponse({ status: 201, description: 'AUTO_BATCH job started' })
  @ApiResponse({ status: 409, description: 'AUTO_BATCH is already running' })
  @ApiResponse({ status: 503, description: 'Failed to launch OpenShift Job' })
  async autoBatch() {
    return this.launchOpenShiftJob(JobType.AUTO_BATCH)
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Job status' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJob(@Param('id', ParseIntPipe) id: number) {
    const job = await this.jobsService.getJob(id)
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`)
    }

    if (
      job.status === JobStatus.RUNNING &&
      this.openshiftJobLauncher.isEnabled() &&
      this.isOpenShiftManagedJobType(job.jobType)
    ) {
      const openshiftStatus = await this.openshiftJobLauncher.getJobStatus(job.jobType, job.id)

      if (openshiftStatus.state === 'FAILED') {
        await this.jobsService.markFailed(id, `OpenShift job failed: ${openshiftStatus.message}`)
        job.status = JobStatus.FAILED
        job.error = `OpenShift job failed: ${openshiftStatus.message}`
        job.completedAt = new Date()
      } else if (
        (openshiftStatus.state === 'NOT_FOUND' || openshiftStatus.state === 'COMPLETED') &&
        this.isOlderThanReconcileThreshold(job)
      ) {
        await this.jobsService.markFailed(
          id,
          `OpenShift job is ${openshiftStatus.state.toLowerCase()} but DB never reached terminal status`,
        )
        job.status = JobStatus.FAILED
        job.error = `OpenShift job is ${openshiftStatus.state.toLowerCase()} but DB never reached terminal status`
        job.completedAt = new Date()
      }
    }

    return toJobRunResponse(job)
  }
}
