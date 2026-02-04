import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import FormData from 'form-data'
import fs from 'fs'
import { catchError, firstValueFrom } from 'rxjs'

@Injectable()
export class FileTransferClientService {
  private readonly logger = new Logger(FileTransferClientService.name)
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

    try {
      const url = this.fileTransferServiceUrl + '/api/transfers'
      const response$ = this.httpService
        .post(url, formData, {
          headers: {
            ...formData.getHeaders(),
          },
        })
        .pipe(
          catchError((error) => {
            this.logger.error(`File transfer failed for ${fileName}`, error?.message)
            throw error
          }),
        )

      const response = await firstValueFrom(response$)
      return response.data
    } catch (error) {
      this.logger.error(
        `Final failure sending file ${fileName} to transfer service`,
        error?.message,
      )
      throw error
    }
  }
}
