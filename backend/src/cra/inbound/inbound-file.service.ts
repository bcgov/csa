import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import path from 'path'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'

const { LOCAL_DIR, RESPONSE_FILE_TYPE } = CRA_DATA_HANDLING_CONSTANT

export const SUPPORTED_RESPONSE_FILE_TYPES = [
  RESPONSE_FILE_TYPE.RSP,
  RESPONSE_FILE_TYPE.WKL,
] as const

export type ResponseFileType = (typeof SUPPORTED_RESPONSE_FILE_TYPES)[number]

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
    return SUPPORTED_RESPONSE_FILE_TYPES.find((type) => type === fileTypeFlag) ?? null
  }

  getResponseFileSequenceNumber(fileName: string): number | null {
    if (this.getResponseFileType(fileName) === null) return null
    const fileMiddle = fileName.split('.')[1] ?? ''
    const sequence = Number.parseInt(fileMiddle.slice(4, 8), 10)
    return Number.isNaN(sequence) ? null : sequence
  }

  isValidResponseFile(fileName: string): boolean {
    return this.getResponseFileType(fileName) !== null
  }
}
