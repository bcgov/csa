import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import FormData from 'form-data'
import { Readable } from 'stream'
import { firstValueFrom } from 'rxjs'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { CraTransferService, InboundFileInfo, TransferResult } from './cra-transfer.service'

const { DESTINATION_ID } = CRA_DATA_HANDLING_CONSTANT

@Injectable()
export class HttpCraTransferService extends CraTransferService {
  private readonly fileTransferServiceUrl: string
  private readonly craEnabled: boolean

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    super()
    this.fileTransferServiceUrl = this.configService.get<string>('app.fileTransferServiceUrl')!
    this.craEnabled = this.configService.get<boolean>('cra.enabled')!
  }

  async sendFile(fileName: string, fileBuffer: Buffer): Promise<TransferResult> {
    if (!this.craEnabled) {
      this.logger.log(`[CRA Disabled] File transfer skipped for ${fileName}`)
      return { success: true, fileName }
    }

    const formData = new FormData()
    formData.append('file', Readable.from(fileBuffer), fileName)
    formData.append('fileName', fileName)

    const url = `${this.fileTransferServiceUrl}/api/destinations/${DESTINATION_ID}/transfers`
    const response = await firstValueFrom(
      this.httpService.post(url, formData, {
        headers: { ...formData.getHeaders() },
      }),
    )
    return response.data
  }

  async listInboundFiles(): Promise<InboundFileInfo[]> {
    if (!this.craEnabled) return []

    const url = `${this.fileTransferServiceUrl}/api/destinations/${DESTINATION_ID}/transfers/inbound`
    const response = await firstValueFrom(
      this.httpService.get(url, {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    return response?.data?.files ?? []
  }

  async downloadInboundFile(fileName: string): Promise<Buffer> {
    const url = `${this.fileTransferServiceUrl}/api/destinations/${DESTINATION_ID}/transfers/${fileName}`
    const response = await firstValueFrom(
      this.httpService.get(url, {
        headers: { 'Content-Type': 'text/plain' },
        responseType: 'arraybuffer',
      }),
    )
    return Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data)
  }

  async moveToProcessed(fileName: string): Promise<void> {
    this.logger.log(`moveToProcessed is a no-op for HTTP transfer (${fileName})`)
  }
}
