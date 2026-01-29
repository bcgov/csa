import { Module, OnModuleInit } from '@nestjs/common'
import { JobRegistry } from 'src/jobs/job-registry.service'
import { JobsModule } from 'src/jobs/jobs.module'
import { IngestDataHandler } from './handlers/ingest-data.handler'
import { IngestIcmHandler } from './handlers/ingest-icm.handler'
import { IngestMisHandler } from './handlers/ingest-mis.handler'
import { RunEligibilityHandler } from './handlers/run-eligibility.handler'
import { SyncIcmHandler } from './handlers/sync-icm.handler'

/*
 * Ingestion from ICM (CRM) and MIS (payment system)
 * Eligibility processing
 * Syncing results back to ICM
 */
// TODO: rename handlers
@Module({
  imports: [JobsModule],
  providers: [
    IngestDataHandler,
    IngestIcmHandler,
    IngestMisHandler,
    RunEligibilityHandler,
    SyncIcmHandler,
  ],
  exports: [
    IngestDataHandler,
    IngestIcmHandler,
    IngestMisHandler,
    RunEligibilityHandler,
    SyncIcmHandler,
  ],
})
export class SyncModule implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly ingestDataHandler: IngestDataHandler,
    private readonly ingestIcmHandler: IngestIcmHandler,
    private readonly ingestMisHandler: IngestMisHandler,
    private readonly runEligibilityHandler: RunEligibilityHandler,
    private readonly syncIcmHandler: SyncIcmHandler,
  ) {}

  onModuleInit() {
    // Register all sync-related job handlers
    this.registry.register(this.ingestDataHandler.jobType, this.ingestDataHandler)
    this.registry.register(this.ingestIcmHandler.jobType, this.ingestIcmHandler)
    this.registry.register(this.ingestMisHandler.jobType, this.ingestMisHandler)
    this.registry.register(this.runEligibilityHandler.jobType, this.runEligibilityHandler)
    this.registry.register(this.syncIcmHandler.jobType, this.syncIcmHandler)
  }
}
