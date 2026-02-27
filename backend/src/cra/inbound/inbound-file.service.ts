import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { existsSync, mkdirSync, statSync } from 'fs'
import { writeFile } from 'fs/promises'
import path from 'path'
import { firstValueFrom } from 'rxjs'
import { PrismaService } from 'src/common/database/prisma.service'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'

const { LOCAL_DIR, RESPONSE_FILE_TYPE, FILE_DIRECTION } = CRA_DATA_HANDLING_CONSTANT

export interface DownloadedFile {
  fileName: string
  localFilePath: string
}

@Injectable()
export class InboundFileService {
  private readonly logger = new Logger(InboundFileService.name)
  private readonly fileStoragePath: string
  private readonly fileTransferServiceUrl: string
  private readonly responseEnvFlag: string

  private readonly craEnabled: boolean

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.fileStoragePath = this.configService.get<string>('app.fileStoragePath')!
    this.fileTransferServiceUrl = this.configService.get<string>('app.fileTransferServiceUrl')!
    this.responseEnvFlag = this.configService.get<string>('cra.responseEnvFlag')!
    this.craEnabled = this.configService.get<boolean>('cra.enabled')!
  }

  async downloadNewResponseFiles(destinationId: string): Promise<DownloadedFile[]> {
    if (!this.craEnabled) {
      this.logger.log('[CRA Disabled] Response file download skipped — no remote files to poll')
      return []
    }

    const existingFiles = await this.prisma.transferFile.findMany({
      where: { direction: FILE_DIRECTION.INBOUND },
      select: { fileName: true },
    })

    const remoteFiles = await this.listRemoteFiles(destinationId)
    const newFiles = remoteFiles.filter(
      (remote) => !existingFiles.some((db) => db.fileName === remote.fileName),
    )

    const downloaded: DownloadedFile[] = []
    for (const file of newFiles) {
      const localFilePath = await this.downloadFile(destinationId, file.fileName)
      const valid = this.isValidResponseFile(file.fileName)

      if (!valid) {
        this.logger.warn(`Invalid response file format: ${file.fileName}`)
      }

      await this.prisma.transferFile.create({
        data: {
          destinationId,
          direction: FILE_DIRECTION.INBOUND,
          fileName: file.fileName,
          fileSize: String(statSync(localFilePath).size),
          downloadedAt: new Date(),
          isValid: valid,
          isDetailsProcessed: !valid,
        },
      })

      if (valid) {
        downloaded.push({ fileName: file.fileName, localFilePath })
      }
    }

    return downloaded
  }

  getLocalFilePath(destinationId: string, fileName: string): string {
    return path.join(this.fileStoragePath, destinationId, LOCAL_DIR.INBOUND, fileName)
  }

  private isValidResponseFile(fileName: string): boolean {
    const fileMiddle = fileName.split('.')[1] ?? ''
    const fileEnvFlag = fileMiddle.slice(0, 1)
    const fileTypeFlag = fileMiddle.slice(1, 4)
    return fileTypeFlag === RESPONSE_FILE_TYPE.RSP && fileEnvFlag === this.responseEnvFlag
  }

  private async listRemoteFiles(destinationId: string): Promise<{ fileName: string }[]> {
    const response = await firstValueFrom(
      this.httpService.get(
        `${this.fileTransferServiceUrl}/api/destinations/${destinationId}/remote-files`,
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )
    return response?.data?.files ?? []
  }

  private async downloadFile(destinationId: string, fileName: string): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.get(
        `${this.fileTransferServiceUrl}/api/destinations/${destinationId}/local/inbound/files/${fileName}`,
        { headers: { 'Content-Type': 'text/plain' }, responseType: 'arraybuffer' },
      ),
    )

    const localFilePath = this.getLocalFilePath(destinationId, fileName)
    const inboundDir = path.dirname(localFilePath)
    if (!existsSync(inboundDir)) {
      mkdirSync(inboundDir, { recursive: true })
    }

    await writeFile(
      localFilePath,
      Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data),
    )

    return localFilePath
  }
}
