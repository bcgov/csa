import { Logger } from '@nestjs/common'

export interface TransferResult {
  success: boolean
  fileName: string
}

export interface InboundFileInfo {
  fileName: string
  size?: number
  lastModifiedAt?: Date
}

export abstract class CraTransferService {
  protected readonly logger = new Logger(this.constructor.name)

  abstract sendFile(fileName: string, fileBuffer: Buffer): Promise<TransferResult>
  abstract listInboundFiles(): Promise<InboundFileInfo[]>
  abstract downloadInboundFile(fileName: string): Promise<Buffer>
  abstract moveToProcessed(fileName: string): Promise<void>
}
