import { HttpModule, HttpService } from '@nestjs/axios'
import { Module, OnModuleInit } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { KeycloakAuthModule } from 'src/common/auth/keycloak-auth.module'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { PrismaModule } from 'src/common/database/prisma.module'
import { adminConfig } from 'src/config/admin.config'
import { syncConfig } from 'src/config/sync.config'
import { JobRegistry } from 'src/jobs/job-registry.service'
import { JobsModule } from 'src/jobs/jobs.module'
import { IngestDataHandler } from './handlers/ingest-data.handler'
import { IngestIcmHandler } from './handlers/ingest-icm.handler'
import { IngestMisHandler } from './handlers/ingest-mis.handler'
import { RunEligibilityHandler } from './handlers/run-eligibility.handler'
import { SyncIcmHandler } from './handlers/sync-icm.handler'
import { IcmApiDataSource } from './icm/data-source/icm-api-data-source'
import { IcmDataSource } from './icm/data-source/icm-data-source'
import { MockIcmDataSource } from './icm/data-source/mock-icm-data-source'
import { IcmService } from './icm/icm.service'

/*
 * Ingestion from ICM (CRM) and MIS (payment system)
 * Eligibility processing
 * Syncing results back to ICM
 */
// TODO: rename handlers
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [syncConfig, adminConfig] }),
    PrismaModule,
    KeycloakAuthModule,
    HttpModule,
    JobsModule,
  ],
  providers: [
    {
      provide: IcmDataSource,
      useFactory: (
        configService: ConfigService,
        httpService: HttpService,
        keycloakAuthService: KeycloakAuthService,
      ) => {
        return configService.get<boolean>('sync.useMocjkData')
          ? new MockIcmDataSource()
          : new IcmApiDataSource(httpService, configService, keycloakAuthService)
      },
      inject: [ConfigService, HttpService, KeycloakAuthService],
    },
    IcmService,
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
