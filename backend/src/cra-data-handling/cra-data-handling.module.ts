import { Module } from '@nestjs/common'

import { FileCreateService } from './file-create.service'
import { FileDecodeService } from './file-decode.service'
import { FileTransferClientService } from './file-transfer.service'
@Module({
  providers: [FileCreateService, FileDecodeService, FileTransferClientService],
  // exports: [FileCreateService, FileDecodeService, FileTransferClientService],
})
export class CraDataHandlingModule {}
