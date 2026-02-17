import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import { CraDetail, CraHeader, CraTrailer } from './outbound.interface'

const { FILE_NAME_PREFIX, REQUEST_FILE } = CRA_DATA_HANDLING_CONSTANT

const {
  HEADER_TRAN_CODE,
  DETAIL_TRAN_CODE,
  TRAILER_TRAN_CODE,
  BUSINESS_NUM,
  VERSION_NUM,
  HEADER_RECORD_CONT,
} = REQUEST_FILE

@Injectable()
export class OutboundFileService {
  private readonly logger = new Logger(OutboundFileService.name)
  private readonly fileStoragePath: string
  private readonly environmentCode: string
  private readonly fileTypeCode: string

  constructor(private readonly configService: ConfigService) {
    this.fileStoragePath = this.configService.get<string>('app.fileStoragePath')!
    this.environmentCode = this.configService.get<string>('cra.environmentCode')!
    this.fileTypeCode = this.configService.get<string>('cra.fileTypeCode')!
  }
  createFile(
    header: CraHeader,
    details: CraDetail[],
    trailer: CraTrailer,
    destinationId: string,
    craUserId: string = 'testuser',
  ): { filePath: string; fileName: string; recordCount: number } {
    const lines: string[] = []

    lines.push(this.buildHeader(header))

    for (const detail of details) {
      if (detail.tranType === 1) {
        lines.push(this.buildCanDetail(detail))
      } else {
        lines.push(this.buildAppDetail(detail))
      }
    }

    lines.push(this.buildTrailer(trailer))
    const destinationPath = join(this.fileStoragePath, destinationId, 'outbound')
    if (!existsSync(destinationPath)) {
      mkdirSync(destinationPath, { recursive: true })
    }
    const fileName = this.createfileName(craUserId)
    const outputPath = join(destinationPath, fileName)

    writeFileSync(outputPath, lines.join('\n'), 'utf8')

    this.logger.log(`File Created Successfuly===> : ${outputPath}`)
    return { filePath: outputPath, fileName: fileName, recordCount: lines.length }
  }

  /* ========= HEADER 6133 ========= */
  private buildHeader(h: CraHeader): string {
    return (
      this.padRight(String(HEADER_TRAN_CODE), 4) +
      this.padRight(VERSION_NUM, 5) +
      this.padRight(h.processDate, 8) +
      this.padRight(BUSINESS_NUM, 15) +
      this.padLeftZero(parseInt(HEADER_RECORD_CONT), 8) +
      this.padRight(h.filler || '', 25)
    )
  }

  /* ========= DETAIL 6134 ========= */
  private buildAppDetail(d: CraDetail): string {
    return (
      this.padRight(DETAIL_TRAN_CODE, 4) +
      this.padRight(d.referenceNum, 20) +
      this.padRight(BUSINESS_NUM, 15) +
      this.padRight(d.tranType, 1) +
      this.padRight(d.childGivenName, 30) +
      this.padRight(d.childInitial, 1) +
      this.padRight(d.childSurName, 30) +
      this.padRight(d.childGivenNameAka, 30) +
      this.padRight(d.childSurNameAka, 30) +
      this.padRight(d.childBirthDate, 8) +
      this.padRight(d.childSex, 1) +
      this.padRight(d.childBirthCity, 28) +
      this.padRight(d.childBirthProv, 2) +
      this.padRight(d.childBirthCountry, 2) +
      this.padRight(d.prevRecipSin || '', 9) +
      this.padRight(d.filler1 || '', 6) +
      this.padRight(d.prevRecipGivenName || '', 30) +
      this.padRight(d.prevRecipSurName || '', 30) +
      this.padRight(d.appStartDate, 8) +
      this.padRight(d.newBornCode, 1) +
      this.padRight(d.filler2 || '', 10) +
      this.padRight(d.ccraDinNum, 9) +
      this.padRight(d.filler3 || '', 15)
    )
  }
  private buildCanDetail(d: CraDetail): string {
    return (
      this.padRight(DETAIL_TRAN_CODE, 4) +
      this.padRight(d.referenceNum, 20) +
      this.padRight(BUSINESS_NUM, 15) +
      this.padRight(d.tranType, 1) +
      this.padRight(d.childGivenName, 30) +
      this.padRight(d.childInitial, 1) +
      this.padRight(d.childSurName, 30) +
      this.padRight(d.childGivenNameAka, 30) +
      this.padRight(d.childSurNameAka, 30) +
      this.padRight(d.childBirthDate, 8) +
      this.padRight(d.childSex, 1) +
      this.padRight(d.childBirthCity, 28) +
      this.padRight(d.childBirthProv, 2) +
      this.padRight(d.childBirthCountry, 2) +
      this.padRight(d.filler1 || '', 75) +
      this.padRight(d.filler2 || '', 8) +
      this.padRight(d.filler3 || '', 1) +
      this.padRight(d.cancelEndDate, 8) +
      this.padRight(d.cancelReasonCode, 2) +
      this.padRight(d.ccraDinNum, 9)
    )
  }

  /* ========= TRAILER 6135 ========= */
  private buildTrailer(t: CraTrailer): string {
    return (
      this.padRight(TRAILER_TRAN_CODE, 4) +
      this.padRight(VERSION_NUM, 5) +
      this.padRight(t.processDate, 8) +
      this.padRight(BUSINESS_NUM, 15) +
      this.padLeftZero(t.recordCount + 2, 8) +
      this.padRight(t.filler, 25)
    )
  }

  /* ========= HELPERS ========= */
  private padRight(value: string | number, length: number): string {
    return String(value ?? '').padEnd(length, ' ')
  }

  private padLeftZero(value: number, length: number): string {
    return value.toString().padStart(length, '0')
  }
  currentDate(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
  }

  /*================= FILE NAME CREATION ================*/

  createfileName(craUserId: string): string {
    const incrementNumber = String(Date.now()).slice(-4)

    return `${FILE_NAME_PREFIX}.${this.environmentCode}.${craUserId}.${this.fileTypeCode}${incrementNumber}.txt`
  }
}
