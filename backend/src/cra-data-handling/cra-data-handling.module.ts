import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'

import { FileDecodeService } from './inboundFile/file-decode.service'
import { FileCreateService } from './outboundFile/file-create.service'
import { FileTransferClientService } from './outboundFile/file-transfer.service'
@Module({
  imports: [
    HttpModule.register({
      timeout: 60000, // 60 seconds timeout
      maxRedirects: 5,
    }),
  ],
  providers: [FileCreateService, FileDecodeService, FileTransferClientService],
  exports: [FileCreateService, FileDecodeService, FileTransferClientService],
})
export class CraDataHandlingModule {}
