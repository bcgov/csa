import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import FormData from 'form-data'
import fs from 'fs'
import { firstValueFrom } from 'rxjs'

@Injectable()
export class OutboundTransferService {
  private readonly logger = new Logger(OutboundTransferService.name)
  private readonly fileTransferServiceUrl: string
  private readonly craEnabled: boolean

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.fileTransferServiceUrl = this.configService.get<string>('app.fileTransferServiceUrl')!
    this.craEnabled = this.configService.get<boolean>('cra.enabled')!
  }

  async sendFileToTransferService(
    filePath: string,
    fileName: string,
    destinationId: string,
  ): Promise<any> {
    if (!this.craEnabled) {
      this.logger.log(`[CRA Disabled] File transfer skipped — file saved at ${filePath}`)
      return { success: true, fileName }
    }

    const formData = new FormData()
    formData.append('file', fs.createReadStream(filePath), fileName)
    formData.append('fileName', fileName)

    const url = `${this.fileTransferServiceUrl}/api/destinations/${destinationId}/transfers`
    const response = await firstValueFrom(
      this.httpService.post(url, formData, {
        headers: { ...formData.getHeaders() },
      }),
    )
    return response.data
  }
}
