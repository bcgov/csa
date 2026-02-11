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
import { FileStorageService } from './mis/file-storage/file-storage.service'
import { MockFileStorageService } from './mis/file-storage/mock-file-storage.service'
import { S3Service } from './mis/file-storage/s3.service'
import { EligibilityService } from './eligibility/eligibility.service'
import { MisService } from './mis/mis.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [syncConfig, adminConfig],
    }),
    HttpModule,
    PrismaModule,
    JobsModule,
    KeycloakAuthModule,
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
    // Factory: IcmDataSource (API or Mock based on config)
    {
      provide: IcmDataSource,
      useFactory: (
        configService: ConfigService,
        httpService: HttpService,
        keycloakAuthService: KeycloakAuthService,
      ) => {
        return configService.get<boolean>('sync.useMockData')
          ? new MockIcmDataSource()
          : new IcmApiDataSource(httpService, configService, keycloakAuthService)
      },
      inject: [ConfigService, HttpService, KeycloakAuthService],
    },
    IcmService,
    MisService,
    EligibilityService,
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
    this.registry.register(this.ingestDataHandler.jobType, this.ingestDataHandler)
    this.registry.register(this.ingestIcmHandler.jobType, this.ingestIcmHandler)
    this.registry.register(this.ingestMisHandler.jobType, this.ingestMisHandler)
    this.registry.register(this.runEligibilityHandler.jobType, this.runEligibilityHandler)
    this.registry.register(this.syncIcmHandler.jobType, this.syncIcmHandler)
  }
}
