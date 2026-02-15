import 'dotenv/config'
import { HttpModule } from '@nestjs/axios'
import { Module, OnModuleInit } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BatchesService } from 'src/api/batches/batches.service'
import { ContactsService } from 'src/api/contacts/contacts.service'
import { PrismaModule } from 'src/common/database/prisma.module'
import { StateMachineModule } from 'src/common/state-machine/state-machine.module'
import { JobRegistry } from 'src/jobs/job-registry.service'
import { JobsModule } from 'src/jobs/jobs.module'
import { appConfig } from '../config/app.config'
import { craConfig } from '../config/cra.config'
import { PollCraResponseHandler } from './handlers/poll-cra-response.handler'
import { SendCraFileHandler } from './handlers/send-cra-file.handler'
import { OutboundFileService } from './outbound/outbound-file.service'
import { OutboundTransferService } from './outbound/outbound-transfer.service'
import { InboundResponseService } from './inbound/inbound-response.service'
import { OutboundDataService } from './outbound/outbound-data.service'

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
    StateMachineModule,
    HttpModule.register({
      timeout: 60000,
    }),
  ],
  providers: [
    SendCraFileHandler,
    PollCraResponseHandler,
    OutboundFileService,
    OutboundTransferService,
    InboundResponseService,
    OutboundDataService,
    BatchesService,
    ContactsService,
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
