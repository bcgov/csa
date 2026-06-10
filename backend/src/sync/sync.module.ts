import { HttpModule } from '@nestjs/axios'
import { Module, OnModuleInit } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { BatchesModule } from 'src/api/batches/batches.module'
import { PrismaModule } from 'src/common/database/prisma.module'
import { adminConfig } from 'src/config/admin.config'
import { icmConfig } from 'src/config/icm.config'
import { syncConfig } from 'src/config/sync.config'
import { JobRegistry } from 'src/jobs/job-registry.service'
import { JobsModule } from 'src/jobs/jobs.module'
import { AutoBatchHandler } from './handlers/auto-batch.handler'
import { BackfillIcmCasesHandler } from './handlers/backfill-icm-cases.handler'
import { BackfillOocAgreementLinesHandler } from './handlers/backfill-ooc-agreement-lines.handler'
import { IngestDataHandler } from './handlers/ingest-data.handler'
import { IngestIcmHandler } from './handlers/ingest-icm.handler'
import { IngestMisHandler } from './handlers/ingest-mis.handler'
import { RunEligibilityHandler } from './handlers/run-eligibility.handler'
import { SyncIcmHandler } from './handlers/sync-icm.handler'
import { IcmSyncBackModule } from './icm/icm-sync-back.module'
import { IcmService } from './icm/icm.service'
import { FileStorageService } from './mis/file-storage/file-storage.service'
import { MockFileStorageService } from './mis/file-storage/mock-file-storage.service'
import { S3Service } from './mis/file-storage/s3.service'
import { AutoBatchService } from './eligibility/auto-batch.service'
import { EligibilityModule } from './eligibility/eligibility.module'
import { MisService } from './mis/mis.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [syncConfig, adminConfig, icmConfig],
    }),
    HttpModule,
    PrismaModule,
    JobsModule,
    BatchesModule,
    IcmSyncBackModule,
    EligibilityModule,
  ],
  providers: [
    // Factory: FileStorageService (S3 or Mock based on config)
    {
      provide: FileStorageService,
      useFactory: (configService: ConfigService) => {
        return configService.get<boolean>('sync.useMockData')
          ? new MockFileStorageService()
          : new S3Service(configService)
      },
      inject: [ConfigService],
    },
    IcmService,
    MisService,
    AutoBatchService,
    AutoBatchHandler,
    BackfillIcmCasesHandler,
    BackfillOocAgreementLinesHandler,
    IngestDataHandler,
    IngestIcmHandler,
    IngestMisHandler,
    RunEligibilityHandler,
    SyncIcmHandler,
  ],
  exports: [
    AutoBatchHandler,
    BackfillIcmCasesHandler,
    BackfillOocAgreementLinesHandler,
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
    private readonly autoBatchHandler: AutoBatchHandler,
    private readonly backfillIcmCasesHandler: BackfillIcmCasesHandler,
    private readonly backfillOocAgreementLinesHandler: BackfillOocAgreementLinesHandler,
    private readonly ingestDataHandler: IngestDataHandler,
    private readonly ingestIcmHandler: IngestIcmHandler,
    private readonly ingestMisHandler: IngestMisHandler,
    private readonly runEligibilityHandler: RunEligibilityHandler,
    private readonly syncIcmHandler: SyncIcmHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.autoBatchHandler.jobType, this.autoBatchHandler)
    this.registry.register(this.backfillIcmCasesHandler.jobType, this.backfillIcmCasesHandler)
    this.registry.register(
      this.backfillOocAgreementLinesHandler.jobType,
      this.backfillOocAgreementLinesHandler,
    )
    this.registry.register(this.ingestDataHandler.jobType, this.ingestDataHandler)
    this.registry.register(this.ingestIcmHandler.jobType, this.ingestIcmHandler)
    this.registry.register(this.ingestMisHandler.jobType, this.ingestMisHandler)
    this.registry.register(this.runEligibilityHandler.jobType, this.runEligibilityHandler)
    this.registry.register(this.syncIcmHandler.jobType, this.syncIcmHandler)
  }
}
