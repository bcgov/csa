import { HttpModule } from '@nestjs/axios'
import { Module, OnModuleInit } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from 'src/common/database/prisma.module'
import { JobRegistry } from 'src/jobs/job-registry.service'
import { JobsModule } from 'src/jobs/jobs.module'
import { appConfig } from '../config/app.config'
import { craConfig } from './cra.config'

import { PollCraResponseHandler } from './handlers/poll-cra-response.handler'
import { SendCraFileHandler } from './handlers/send-cra-file.handler'
import { FileCreateService } from './outbound-file/file-create.service'
import { FileTransferClientService } from './outbound-file/file-transfer.service'
import { ResponseFileService } from './inbound-file/response-file.service'
import { CraDataService } from './outbound-file/cra-data.service'


/*
 * Generates and sends files to CRA
 * Polls and process response files from CRA
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [craConfig, appConfig],
    }),
    JobsModule,
    PrismaModule,
    HttpModule.register({
      timeout: 60000, //TODO: check this 60 seconds timeout
    }),
  ],
  providers: [
    SendCraFileHandler,
    PollCraResponseHandler,
    FileCreateService,
    FileTransferClientService,
    ResponseFileService,
    CraDataService,
  ],
  exports: [SendCraFileHandler, PollCraResponseHandler],
})
export class CraModule implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly sendCraFileHandler: SendCraFileHandler,
    private readonly pollCraResponseHandler: PollCraResponseHandler,
  ) {}

  onModuleInit() {
    // Register CRA-related job handlers
    this.registry.register(this.sendCraFileHandler.jobType, this.sendCraFileHandler)
    this.registry.register(this.pollCraResponseHandler.jobType, this.pollCraResponseHandler)
  }
}
