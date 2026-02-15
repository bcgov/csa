import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import FormData from 'form-data'
import fs from 'fs'
import { firstValueFrom } from 'rxjs'

@Injectable()
export class OutboundTransferService {
  private readonly fileTransferServiceUrl: string

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.fileTransferServiceUrl = this.configService.get<string>('app.fileTransferServiceUrl')!
  }

  async sendFileToTransferService(
    filePath: string,
    fileName: string,
    destinationId: string,
  ): Promise<any> {
    const formData = new FormData()
    formData.append('file', fs.createReadStream(filePath), fileName)
    formData.append('destinationId', destinationId)
    formData.append('fileName', fileName)

    const url = this.fileTransferServiceUrl + '/api/transfers'
    const response = await firstValueFrom(
      this.httpService.post(url, formData, {
        headers: { ...formData.getHeaders() },
      }),
    )
    return response.data
  }
}
