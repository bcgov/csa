import 'dotenv/config'
import { Module, OnModuleInit } from '@nestjs/common'
import { JobRegistry } from 'src/jobs/job-registry.service'
import { JobsModule } from 'src/jobs/jobs.module'
import { PollCraResponseHandler } from './handlers/poll-cra-response.handler'
import { SendCraFileHandler } from './handlers/send-cra-file.handler'
import { HttpModule } from '@nestjs/axios'
import { FileCreateService } from './outbound-file/file-create.service'
import { FileTransferClientService } from './outbound-file/file-transfer.service'

/*
 * Generates and sends files to CRA
 * Polls and process response files from CRA
 */
@Module({
  imports: [
    JobsModule,
    HttpModule.register({
      timeout: 60000, // 60 seconds timeout
      // maxRedirects: 5,
    }),
  ],
  providers: [
    SendCraFileHandler,
    PollCraResponseHandler,
    FileCreateService,
    FileTransferClientService,
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
