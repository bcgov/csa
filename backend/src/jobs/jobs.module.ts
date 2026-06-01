import { Module, OnModuleInit } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from 'src/common/database/prisma.module'
import openshiftConfig from 'src/config/openshift.config'
import { IcmSyncBackModule } from 'src/sync/icm/icm-sync-back.module'
import { RetryFailedHandler } from './handlers/retry-failed.handler'
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
  imports: [PrismaModule, IcmSyncBackModule, ConfigModule.forFeature(openshiftConfig)],
  providers: [JobsService, JobRunner, JobRegistry, RetryFailedHandler, OpenshiftJobLauncher],
  exports: [JobsService, JobRunner, JobRegistry, RetryFailedHandler, OpenshiftJobLauncher],
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
