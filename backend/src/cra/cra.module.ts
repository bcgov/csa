import 'dotenv/config'
import { HttpModule, HttpService } from '@nestjs/axios'
import { Logger, Module, OnModuleInit } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import path from 'path'
import { BatchesModule } from 'src/api/batches/batches.module'
import { ContactsModule } from 'src/api/contacts/contacts.module'
import { PrismaModule } from 'src/common/database/prisma.module'
import { JobRegistry } from 'src/jobs/job-registry.service'
import { JobsModule } from 'src/jobs/jobs.module'
import { IcmSyncBackModule } from 'src/sync/icm/icm-sync-back.module'
import { SyncIcmHandler } from 'src/sync/handlers/sync-icm.handler'
import { appConfig } from '../config/app.config'
import { craConfig } from '../config/cra.config'
import { syncConfig } from '../config/sync.config'
import { BackfillWklFileRecordsHandler } from './handlers/backfill-wkl-file-records.handler'
import { PollCraResponseHandler } from './handlers/poll-cra-response.handler'
import { SendCraFileHandler } from './handlers/send-cra-file.handler'
import { InboundResponseService } from './inbound/inbound-response.service'
import { CraInboundModule } from './inbound/cra-inbound.module'
import { OutboundDataService } from './outbound/outbound-data.service'
import { OutboundFileService } from './outbound/outbound-file.service'
import { CraTransferService } from './transfer/cra-transfer.service'
import { HttpCraTransferService } from './transfer/http-cra-transfer.service'
import { MockCraTransferService } from './transfer/mock-cra-transfer.service'
import { S3CraTransferService } from './transfer/s3-cra-transfer.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [craConfig, appConfig, syncConfig],
    }),
    JobsModule,
    PrismaModule,
    BatchesModule,
    ContactsModule,
    IcmSyncBackModule,
    CraInboundModule,
    HttpModule.register({
      timeout: 60000,
    }),
  ],
  providers: [
    SendCraFileHandler,
    PollCraResponseHandler,
    BackfillWklFileRecordsHandler,
    SyncIcmHandler,
    OutboundFileService,
    InboundResponseService,
    OutboundDataService,
    {
      provide: CraTransferService,
      useFactory: (configService: ConfigService, httpService: HttpService) => {
        const logger = new Logger('CraModule')
        if (configService.get<boolean>('sync.isLocal')) {
          const storagePath = configService.get<string>('app.fileStoragePath')!
          return new MockCraTransferService(path.join(storagePath, 'cra-mock'))
        }
        const transferMode = configService.get<string>('cra.transferMode')
        if (transferMode === 's3') {
          return new S3CraTransferService(configService)
        }
        if (transferMode !== 'http') {
          logger.log(`Unknown CRA_TRANSFER_MODE "${transferMode}", falling back to http`)
        }
        return new HttpCraTransferService(httpService, configService)
      },
      inject: [ConfigService, HttpService],
    },
  ],
  exports: [SendCraFileHandler, PollCraResponseHandler],
})
export class CraModule implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly sendCraFileHandler: SendCraFileHandler,
    private readonly pollCraResponseHandler: PollCraResponseHandler,
    private readonly backfillWklFileRecordsHandler: BackfillWklFileRecordsHandler,
    private readonly syncIcmHandler: SyncIcmHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.sendCraFileHandler.jobType, this.sendCraFileHandler)
    this.registry.register(this.pollCraResponseHandler.jobType, this.pollCraResponseHandler)
    this.registry.register(
      this.backfillWklFileRecordsHandler.jobType,
      this.backfillWklFileRecordsHandler,
    )
    this.registry.register(this.syncIcmHandler.jobType, this.syncIcmHandler)
  }
}
