import {
  BadRequestException,
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
import { BATCH_STATUS } from 'src/common/state-machine/constants'
import type { DeployEnv } from 'src/config/app.config'
import { JobStatus } from 'src/jobs/enums/job-status.enum'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobRunner } from 'src/jobs/job-runner.service'
import { JobsService } from 'src/jobs/jobs.service'
import { OpenshiftJobLauncher } from 'src/jobs/openshift-job-launcher.service'
import { BatchesService } from '../batches/batches.service'
import { CSAGuard } from '../common/guards/csa.guard'
import { canRunBulkJobInApiProcess } from './bulk-job-deploy-env'
import { getJobRunWarning } from './job-openshift-advisory'

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
  warning?: string
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
    error: job.error,
    metadata: (job.metadata as Record<string, unknown> | null) ?? null,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    ...(warning ? { warning } : {}),
  }
}

@ApiTags('jobs')
@Controller('jobs')
@UseGuards(CSAGuard)
export class JobsController {
  private readonly logger = new Logger(JobsController.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly jobRunner: JobRunner,
    private readonly jobsService: JobsService,
    private readonly openshiftJobLauncher: OpenshiftJobLauncher,
    private readonly batchesService: BatchesService,
  ) {}

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
      message: `Running ${jobType} in API process (DEPLOY_ENV=local)`,
    }
  }

  private async launchOpenShiftJob(
    jobType: JobType,
  ): Promise<{ jobRunId: number; message: string; openshiftJobName?: string }> {
    if (!this.openshiftJobLauncher.isEnabled()) {
      const deployEnv = this.configService.get<DeployEnv>('app.deployEnv', 'local')
      if (canRunBulkJobInApiProcess(deployEnv)) {
        return this.startFireAndForgetJob(jobType)
      }

      throw new ServiceUnavailableException(
        `Bulk ${jobType} jobs must run in OpenShift when DEPLOY_ENV is ${deployEnv}. The job launcher is not available.`,
      )
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

  /**
   * Launch an OpenShift job with metadata.
   * Supports both OpenShift and local execution with metadata passed to the job handler.
   */
  private async launchOpenShiftJobWithMetadata(
    jobType: JobType,
    metadata: Record<string, unknown>,
  ): Promise<{ jobRunId: number; message: string; openshiftJobName?: string }> {
    if (!this.openshiftJobLauncher.isEnabled()) {
      const deployEnv = this.configService.get<DeployEnv>('app.deployEnv', 'local')
      if (canRunBulkJobInApiProcess(deployEnv)) {
        // Local execution with metadata
        let jobRun
        try {
          jobRun = await this.jobsService.createJob({
            jobType,
            jobTrigger: JobTrigger.END_USER,
            metadata,
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
          message: `Running ${jobType} in API process (DEPLOY_ENV=local)`,
        }
      }

      throw new ServiceUnavailableException(
        `Bulk ${jobType} jobs must run in OpenShift when DEPLOY_ENV is ${deployEnv}. The job launcher is not available.`,
      )
    }

    // OpenShift execution with metadata
    let jobRun
    try {
      jobRun = await this.jobsService.createJob({
        jobType,
        jobTrigger: JobTrigger.END_USER,
        metadata,
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`${jobType} is already running`)
      }
      throw err
    }

    this.logger.log(
      `Created job_run ${jobRun.id} for ${jobType} with metadata: ${JSON.stringify(metadata)}, launching OpenShift Job...`,
    )

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

  @Post('send-cra-file/:batchId')
  @ApiResponse({ status: 201, description: 'SEND_CRA_FILE job started for the batch' })
  @ApiResponse({
    status: 400,
    description: 'Invalid batch status - only PENDING batches can be sent',
  })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  @ApiResponse({ status: 409, description: 'SEND_CRA_FILE is already running' })
  @ApiResponse({ status: 503, description: 'Failed to launch OpenShift Job' })
  async sendCraFile(@Param('batchId', ParseIntPipe) batchId: number) {
    // Validate batch exists and get its details
    let batch
    try {
      batch = await this.batchesService.findOne(batchId)
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new NotFoundException(`Batch ${batchId} not found`)
      }
      throw err
    }

    // Validate batch is in PENDING status
    if (batch.status !== BATCH_STATUS.PENDING) {
      throw new BadRequestException(
        `Cannot send batch ${batchId} to CRA. Current status is '${batch.status}', but only '${BATCH_STATUS.PENDING}' batches can be sent.`,
      )
    }

    // Validate batch has at least 1 record
    if (batch.recordCount < 1) {
      throw new BadRequestException(
        `Cannot send batch ${batchId} to CRA. Batch must have at least 1 record.`,
      )
    }

    this.logger.log(
      `User triggered SEND_CRA_FILE for batch ${batchId} (status: ${batch.status}, records: ${batch.recordCount})`,
    )

    // Launch job with batchId in metadata
    return this.launchOpenShiftJobWithMetadata(JobType.SEND_CRA_FILE, { batchId })
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
}
