import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import path from 'path'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'

const { LOCAL_DIR, RESPONSE_FILE_TYPE } = CRA_DATA_HANDLING_CONSTANT

export type ResponseFileType = 'RSP' | 'WKL'

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

  // CRA file naming convention: `<prefix>.<envFlag><typeFlag><seq>.<ext>`
  // envFlag is 1 char ('P' prod / 'A' test), typeFlag is the 3-char response type (RSP, WKL, ...)
  getResponseFileType(fileName: string): ResponseFileType | null {
    const fileMiddle = fileName.split('.')[1] ?? ''
    const fileEnvFlag = fileMiddle.slice(0, 1)
    const fileTypeFlag = fileMiddle.slice(1, 4)
    if (fileEnvFlag !== this.responseEnvFlag) return null
    if (fileTypeFlag === RESPONSE_FILE_TYPE.RSP) return 'RSP'
    if (fileTypeFlag === RESPONSE_FILE_TYPE.WKL) return 'WKL'
    return null
  }

  isValidResponseFile(fileName: string): boolean {
    return this.getResponseFileType(fileName) !== null
  }
}
