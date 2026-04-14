import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import path from 'path'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'

const { LOCAL_DIR, RESPONSE_FILE_TYPE } = CRA_DATA_HANDLING_CONSTANT

@Injectable()
export class InboundFileService {
  private readonly fileStoragePath: string
  private readonly responseEnvFlag: string

  constructor(private readonly configService: ConfigService) {
    this.fileStoragePath = this.configService.get<string>('app.fileStoragePath')!
    this.responseEnvFlag = this.configService.get<string>('cra.responseEnvFlag')!
  }

  getLocalFilePath(destinationId: string, fileName: string): string {
    return path.join(this.fileStoragePath, destinationId, LOCAL_DIR.INBOUND, fileName)
  }

  isValidResponseFile(fileName: string): boolean {
    const fileMiddle = fileName.split('.')[1] ?? ''
    const fileEnvFlag = fileMiddle.slice(0, 1)
    const fileTypeFlag = fileMiddle.slice(1, 4)
    return (
      (fileTypeFlag === RESPONSE_FILE_TYPE.RSP || fileTypeFlag === RESPONSE_FILE_TYPE.WKL) &&
      fileEnvFlag === this.responseEnvFlag
    )
  }
}
