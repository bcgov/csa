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
@UseGuards(CSAGuard) // TODO: Uncomment for production - temporarily disabled for testing
export class JobsController {
  private readonly logger = new Logger(JobsController.name)

  constructor(
    private readonly jobRunner: JobRunner,
    private readonly jobsService: JobsService,
    private readonly openshiftJobLauncher: OpenshiftJobLauncher,
  ) {}

  // Concurrency: csa.job_runs has a partial unique index on (job_type) WHERE status='RUNNING'
  // so the second concurrent createJob for the same type raises P2002. We translate that to 409.
  private async launchOpenShiftJob(
    jobType: JobType,
  ): Promise<{ jobRunId: number; message: string; openshiftJobName?: string }> {
    // If OpenShift is disabled, return immediately without creating job_runs
    if (!this.openshiftJobLauncher.isEnabled()) {
      return {
        jobRunId: 0,
        message: 'OpenShift job launcher is disabled. No job created.',
      }
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
      // Note: job_run still exists in PENDING state; can be retried or executed locally
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
  async runEligibility() {
    return this.launchOpenShiftJob(JobType.RUN_ELIGIBILITY)
  }

  @Post('auto-batch')
  @ApiResponse({ status: 201, description: 'AUTO_BATCH job started' })
  @ApiResponse({ status: 409, description: 'AUTO_BATCH is already running' })
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
    return toJobRunResponse(job)
  }
}
