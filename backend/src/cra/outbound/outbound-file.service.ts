import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { formatDatePacificCompact } from 'src/common/utils'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import { CraDetail, CraHeader, CraTrailer } from './outbound.interface'

const { REQUEST_FILE } = CRA_DATA_HANDLING_CONSTANT

const { HEADER_TRAN_CODE, DETAIL_TRAN_CODE, TRAILER_TRAN_CODE, VERSION_NUM, HEADER_RECORD_CONT } =
  REQUEST_FILE

@Injectable()
export class OutboundFileService {
  private readonly logger = new Logger(OutboundFileService.name)
  private readonly fileStoragePath: string
  private readonly environmentCode: string
  private readonly fileTypeCode: string
  private readonly fileNamePrefix: string
  private readonly businessNum: string
  private readonly craUserId: string

  constructor(private readonly configService: ConfigService) {
    this.businessNum = this.configService.get<string>('cra.businessNum')!
    this.fileStoragePath = this.configService.get<string>('app.fileStoragePath')!
    this.environmentCode = this.configService.get<string>('cra.environmentCode')!
    this.fileTypeCode = this.configService.get<string>('cra.fileTypeCode')!
    this.fileNamePrefix = this.configService.get<string>('cra.fileNamePrefix')!
    this.craUserId = this.configService.get<string>('cra.userId')!
  }
  createFile(
    header: CraHeader,
    details: CraDetail[],
    trailer: CraTrailer,
    destinationId: string,
    sequenceNumber: number,
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
    const fileName = this.createFileName(sequenceNumber)
    const outputPath = join(destinationPath, fileName)

    writeFileSync(outputPath, lines.join('\n'), 'utf8')

    this.logger.log(`File created: ${outputPath}`)
    return { filePath: outputPath, fileName: fileName, recordCount: lines.length }
  }

  private buildHeader(header: CraHeader): string {
    // 6133
    return (
      this.padRight(String(HEADER_TRAN_CODE), 4) +
      this.padRight(VERSION_NUM, 5) +
      this.padRight(header.processDate, 8) +
      this.padRight(this.businessNum, 15) +
      this.padLeftZero(parseInt(HEADER_RECORD_CONT), 8) +
      this.padRight(header.filler || '', 25)
    )
  }

  private buildAppDetail(detail: CraDetail): string {
    // 6134
    return (
      this.padRight(DETAIL_TRAN_CODE, 4) +
      this.padRight(detail.referenceNum, 20) +
      this.padRight(this.businessNum, 15) +
      this.padRight(detail.tranType, 1) +
      this.padRight(detail.childGivenName, 30) +
      this.padRight(detail.childInitial, 1) +
      this.padRight(detail.childSurName, 30) +
      this.padRight(detail.childGivenNameAka, 30) +
      this.padRight(detail.childSurNameAka, 30) +
      this.padRight(detail.childBirthDate, 8) +
      this.padRight(detail.childSex, 1) +
      this.padRight(detail.childBirthCity, 28) +
      this.padRight(detail.childBirthProv, 2) +
      this.padRight(detail.childBirthCountry, 2) +
      this.padRight(detail.prevRecipSin || '', 9) +
      this.padRight(detail.filler1 || '', 6) +
      this.padRight(detail.prevRecipGivenName || '', 30) +
      this.padRight(detail.prevRecipSurName || '', 30) +
      this.padRight(detail.appStartDate, 8) +
      this.padRight(detail.newBornCode, 1) +
      this.padRight(detail.filler2 || '', 10) +
      this.padRight(detail.ccraDinNum, 9) +
      this.padRight(detail.filler3 || '', 15)
    )
  }
  private buildCanDetail(detail: CraDetail): string {
    // 6134
    return (
      this.padRight(DETAIL_TRAN_CODE, 4) +
      this.padRight(detail.referenceNum, 20) +
      this.padRight(this.businessNum, 15) +
      this.padRight(detail.tranType, 1) +
      this.padRight(detail.childGivenName, 30) +
      this.padRight(detail.childInitial, 1) +
      this.padRight(detail.childSurName, 30) +
      this.padRight(detail.childGivenNameAka, 30) +
      this.padRight(detail.childSurNameAka, 30) +
      this.padRight(detail.childBirthDate, 8) +
      this.padRight(detail.childSex, 1) +
      this.padRight(detail.childBirthCity, 28) +
      this.padRight(detail.childBirthProv, 2) +
      this.padRight(detail.childBirthCountry, 2) +
      this.padRight(detail.filler1 || '', 75) +
      this.padRight(detail.filler2 || '', 8) +
      this.padRight(detail.filler3 || '', 1) +
      this.padRight(detail.cancelEndDate, 8) +
      this.padRight(detail.cancelReasonCode, 2) +
      this.padRight(detail.ccraDinNum, 9)
    )
  }

  private buildTrailer(trailer: CraTrailer): string {
    // 6135
    return (
      this.padRight(TRAILER_TRAN_CODE, 4) +
      this.padRight(VERSION_NUM, 5) +
      this.padRight(trailer.processDate, 8) +
      this.padRight(this.businessNum, 15) +
      this.padLeftZero(trailer.recordCount + 2, 8) +
      this.padRight(trailer.filler, 25)
    )
  }

  private padRight(value: string | number, length: number): string {
    return String(value ?? '')
      ?.padEnd(length, ' ')
      ?.slice(0, length)
  }

  private padLeftZero(value: number, length: number): string {
    return String(value ?? '')
      ?.padStart(length, '0')
      ?.slice(0, length)
  }
  currentDate(): string {
    return formatDatePacificCompact(new Date())
  }

  createFileName(sequenceNumber: number): string {
    const paddedSequence = String(sequenceNumber).padStart(4, '0')

    return `${this.fileNamePrefix}.${this.environmentCode}.${this.craUserId}.${this.fileTypeCode}${paddedSequence}`
  }
}
