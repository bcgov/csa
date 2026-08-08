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
import { ConfigService } from '@nestjs/config'
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Prisma } from '@prisma/client'
import type { DeployEnv } from 'src/config/app.config'
import { JobActivitySeverity } from 'src/jobs/enums/job-activity-severity.enum'
import { JobActivityType } from 'src/jobs/enums/job-activity-type.enum'
import { JobStatus } from 'src/jobs/enums/job-status.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import {
  formatJobDisplayName,
  formatJobSummary,
  formatMonitoringStatus,
  formatTriggeredBy,
} from 'src/jobs/job-monitoring.utils'
import { JobRunner } from 'src/jobs/job-runner.service'
import {
  JobsService,
  type MonitoringActivityFilters,
  type MonitoringHistoryFilters,
} from 'src/jobs/jobs.service'
import { OpenshiftJobLauncher } from 'src/jobs/openshift-job-launcher.service'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { BlockDqStewardGuard } from '../common/guards/block-dq-steward.guard'
import { CSAGuard } from '../common/guards/csa.guard'
import { canRunBulkJobInApiProcess } from './bulk-job-deploy-env'
import { getJobRunWarning } from './job-openshift-advisory'

const PAGE_DEFAULT = 1
const LIMIT_DEFAULT = 20
const LIMIT_MAX = 200
const GENERIC_JOB_FAILURE_SUFFIX =
  'failed unexpectedly. Please retry. If it persists, contact support.'

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
  warning?: string
}

interface MonitoringJobResponse {
  id: number
  jobId: number
  jobName: string
  status: string
  triggeredBy: string
  started: Date | null
  finished: Date | null
  summary: string | null
  warning: string | null
}

function toUserFacingJobError(jobType: string, error: string | null): string | null {
  return error ? `${jobType} ${GENERIC_JOB_FAILURE_SUFFIX}` : null
}

function toJobRunResponse(
  job: {
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
  },
  warning?: string,
): JobRunResponse {
  return {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    jobTrigger: job.jobTrigger,
    retryCount: job.retryCount,
    error: toUserFacingJobError(job.jobType, job.error),
    metadata: (job.metadata as Record<string, unknown> | null) ?? null,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    ...(warning ? { warning } : {}),
  }
}

@ApiTags('jobs')
@Controller('jobs')
@UseGuards(CSAGuard, BlockDqStewardGuard)
export class JobsController {
  private readonly logger = new Logger(JobsController.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly jobRunner: JobRunner,
    private readonly jobsService: JobsService,
    private readonly openshiftJobLauncher: OpenshiftJobLauncher,
  ) {}

  private async createEndUserJobRun(jobType: JobType, triggeredByUser: string) {
    try {
      return await this.jobsService.createJob({
        jobType,
        jobTrigger: JobTrigger.END_USER,
        triggeredByUser,
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`${jobType} is already running`)
      }
      throw err
    }
  }

  // Concurrency: csa.job_runs has a partial unique index on (job_type) WHERE status='RUNNING'
  // so the second concurrent createJob for the same type raises P2002. We translate that to 409.
  private async startFireAndForgetJob(
    jobType: JobType,
    triggeredByUser: string,
  ): Promise<{ jobRunId: number; message: string }> {
    const jobRun = await this.createEndUserJobRun(jobType, triggeredByUser)

    this.jobRunner.executeJob(jobRun.id).catch((err) => {
      this.logger.error(
        `Background local job ${jobRun.id} [${jobType}] crashed: ${(err as Error).message}`,
        (err as Error).stack,
      )
    })

    return {
      jobRunId: jobRun.id,
      message: `Running ${jobType} in API process (DEPLOY_ENV=local)`,
    }
  }

  private async launchOpenShiftJob(
    jobType: JobType,
    triggeredByUser: string,
  ): Promise<{ jobRunId: number; message: string; openshiftJobName?: string }> {
    if (!this.openshiftJobLauncher.isEnabled()) {
      const deployEnv = this.configService.get<DeployEnv>('app.deployEnv', 'local')
      if (canRunBulkJobInApiProcess(deployEnv)) {
        return this.startFireAndForgetJob(jobType, triggeredByUser)
      }

      throw new ServiceUnavailableException(
        `Bulk ${jobType} jobs must run in OpenShift when DEPLOY_ENV is ${deployEnv}. The job launcher is not available.`,
      )
    }
    const jobRun = await this.createEndUserJobRun(jobType, triggeredByUser)

    this.logger.log(`Created job_run ${jobRun.id} for ${jobType}, launching OpenShift Job...`)

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
    const data = await Promise.all(
      result.data.map(async (job) => {
        const warning = await getJobRunWarning(job, this.openshiftJobLauncher)
        return toJobRunResponse(job, warning)
      }),
    )

    return {
      data,
      total: result.total,
      page: result.page,
      limit: result.limit,
    }
  }

  @Post('run-eligibility')
  @ApiResponse({ status: 201, description: 'RUN_ELIGIBILITY job started' })
  @ApiResponse({ status: 409, description: 'RUN_ELIGIBILITY is already running' })
  @ApiResponse({ status: 503, description: 'Failed to launch OpenShift Job' })
  async runEligibility(@CurrentUser() userId: string) {
    return this.launchOpenShiftJob(JobType.RUN_ELIGIBILITY, userId)
  }

  @Post('auto-batch')
  @ApiResponse({ status: 201, description: 'AUTO_BATCH job started' })
  @ApiResponse({ status: 409, description: 'AUTO_BATCH is already running' })
  @ApiResponse({ status: 503, description: 'Failed to launch OpenShift Job' })
  async autoBatch(@CurrentUser() userId: string) {
    return this.launchOpenShiftJob(JobType.AUTO_BATCH, userId)
  }

  @Post('send-cra-file')
  @ApiResponse({ status: 201, description: 'SEND_CRA_FILE job started' })
  @ApiResponse({ status: 409, description: 'SEND_CRA_FILE is already running' })
  @ApiResponse({ status: 503, description: 'Failed to launch OpenShift Job' })
  async sendCraFile(@CurrentUser() userId: string) {
    return this.launchOpenShiftJob(JobType.SEND_CRA_FILE, userId)
  }

  @Get('monitoring/latest')
  @ApiResponse({ status: 200, description: 'Latest monitored job run per job type' })
  async getLatestJobs() {
    const jobs = await this.jobsService.getLatestJobsPerType()
    return Promise.all(
      jobs.map(async (job) => {
        const advisory = await getJobRunWarning(job, this.openshiftJobLauncher)
        return this.toMonitoringResponse(job, advisory)
      }),
    )
  }

  @Get('monitoring/history')
  @ApiResponse({ status: 200, description: 'Monitored job history (last month)' })
  async getJobHistory(
    @Query('jobType', new ParseEnumPipe(JobType, { optional: true })) jobType?: JobType,
    @Query('status', new ParseEnumPipe(JobStatus, { optional: true })) status?: JobStatus,
    @Query('jobId', new ParseIntPipe({ optional: true })) jobId?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 10,
    @Query('triggeredBy') triggeredBy?: string,
    @Query('sortBy') sortBy?: MonitoringHistoryFilters['sortBy'],
    @Query('sortOrder') sortOrder?: MonitoringHistoryFilters['sortOrder'],
  ) {
    const result = await this.jobsService.getJobHistory({
      jobType,
      status,
      jobId,
      page,
      limit,
      triggeredBy,
      sortBy,
      sortOrder,
    })

    const data = await Promise.all(
      result.data.map(async (job) => {
        const advisory = await getJobRunWarning(job, this.openshiftJobLauncher)
        return this.toMonitoringResponse(job, advisory)
      }),
    )

    return {
      ...result,
      data,
    }
  }

  @Get('monitoring/triggered-by')
  @ApiResponse({ status: 200, description: 'Distinct Trigger By values for monitored jobs' })
  async getMonitoringTriggeredBy() {
    return this.jobsService.getMonitoringTriggeredByValues()
  }

  @Get('monitoring/activities')
  @ApiResponse({ status: 200, description: 'Recent monitoring activities' })
  async getRecentActivities(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 10,
    @Query('severity', new ParseEnumPipe(JobActivitySeverity, { optional: true }))
    severity?: JobActivitySeverity,
    @Query('type', new ParseEnumPipe(JobActivityType, { optional: true })) type?: JobActivityType,
    @Query('sortBy') sortBy?: MonitoringActivityFilters['sortBy'],
    @Query('sortOrder') sortOrder?: MonitoringActivityFilters['sortOrder'],
  ) {
    return this.jobsService.getRecentActivities(page, limit, {
      severity,
      type,
      sortBy,
      sortOrder,
    })
  }

  @Get(':id/activities')
  @ApiResponse({ status: 200, description: 'Monitoring activities for a specific job run' })
  async getJobActivities(
    @Param('id', ParseIntPipe) jobId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 10,
    @Query('severity', new ParseEnumPipe(JobActivitySeverity, { optional: true }))
    severity?: JobActivitySeverity,
    @Query('type', new ParseEnumPipe(JobActivityType, { optional: true })) type?: JobActivityType,
    @Query('sortBy') sortBy?: MonitoringActivityFilters['sortBy'],
    @Query('sortOrder') sortOrder?: MonitoringActivityFilters['sortOrder'],
  ) {
    return this.jobsService.getActivities({
      jobRunId: jobId,
      page,
      limit,
      severity,
      type,
      sortBy,
      sortOrder,
    })
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Job status' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJob(@Param('id', ParseIntPipe) id: number) {
    const job = await this.jobsService.getJob(id)
    if (!job) {
      throw new NotFoundException(`Job ${id} not found`)
    }

    const warning = await getJobRunWarning(job, this.openshiftJobLauncher)
    return toJobRunResponse(job, warning)
  }

  private toMonitoringResponse(
    job: {
      id: number
      jobType: string
      status: string
      jobTrigger: string
      triggeredByUser?: string | null
      startedAt: Date | null
      completedAt: Date | null
      metadata?: unknown
    },
    advisoryWarning?: string,
  ): MonitoringJobResponse {
    return {
      id: job.id,
      jobId: job.id,
      jobName: formatJobDisplayName(job.jobType),
      status: formatMonitoringStatus(job.status),
      triggeredBy: formatTriggeredBy(job),
      started: job.startedAt,
      finished: job.completedAt,
      summary: formatJobSummary(job),
      warning: advisoryWarning ?? null,
    }
  }
}
