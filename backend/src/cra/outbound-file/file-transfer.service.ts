import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { SERVER_CONFIG } from 'src/cra/cra.config'
import fs from 'fs'
import FormData from 'form-data'
import { catchError, firstValueFrom } from 'rxjs'

const { FTP_BASE_URL } = SERVER_CONFIG

@Injectable()
export class FileTransferClientService {
  private readonly logger = new Logger(FileTransferClientService.name)

  constructor(private readonly httpService: HttpService) {}

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
      const url = FTP_BASE_URL + '/api/transfers'
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
