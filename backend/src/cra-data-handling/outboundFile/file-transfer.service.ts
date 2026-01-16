import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom, retry, catchError } from 'rxjs'
import fs from 'fs'
import FormData from 'form-data'
import { SERVER_CONFIG } from 'src/common/config/server.config'

const { SERVICE_NAME, FTP_BASE_URL } = SERVER_CONFIG

@Injectable()
export class FileTransferClientService {
  private readonly logger = new Logger(FileTransferClientService.name)

  constructor(private readonly httpService: HttpService) {}

  async sendFileToTransferService(
    filePath: string,
    fileName: string,
    craUserId: string = 'testuser',
  ): Promise<any> {
    const formData = new FormData()
    formData.append('file', fs.createReadStream(filePath), fileName)

    try {
      const response$ = this.httpService
        .post(FTP_BASE_URL, formData, {
          headers: {
            ...formData.getHeaders(),
            userid: craUserId,
            servicename: SERVICE_NAME,
          },
        })
        .pipe(
          retry(3), // 🔁 Retry 3 times (network/5xx)
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
