import { Module, OnModuleInit } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { IcmSyncBackModule } from 'src/sync/icm/icm-sync-back.module'
import { RetryFailedHandler } from './handlers/retry-failed.handler'
import { JobActivityService } from './job-activity.service'
import { JobRegistry } from './job-registry.service'
import { JobRunner } from './job-runner.service'
import { JobsService } from './jobs.service'
import { OpenshiftJobLauncher } from './openshift-job-launcher.service'

/*
 * JobsModule provides the job framework infrastructure
 *
 * Exports:
 * - JobsService: Database operations for job_runs
 * - JobRunner: Execute jobs with retry logic
 * - JobRegistry: Register and retrieve job handlers
 * - OpenshiftJobLauncher: Create OpenShift Jobs from CronJob templates
 * - Register their handlers (cross-cutting jobs) with JobRegistry in onModuleInit()
 */
@Module({
  imports: [PrismaModule, IcmSyncBackModule],
  providers: [JobsService, JobActivityService, JobRunner, JobRegistry, RetryFailedHandler, OpenshiftJobLauncher],
  exports: [JobsService, JobActivityService, JobRunner, JobRegistry, RetryFailedHandler, OpenshiftJobLauncher],
})
export class JobsModule implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly retryFailedHandler: RetryFailedHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.retryFailedHandler.jobType, this.retryFailedHandler)
  }
}
