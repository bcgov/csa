import { Injectable } from '@nestjs/common'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { COMMON_CONSTANT } from 'src/common/constant/common.constant'
import { CraDetail, CraHeader, CraTrailer } from './file-create.interface'
import { FileTransferClientService } from './file-transfer.service'
import { FILE_MOCK_DATA } from './file-mock-data'
import { SERVER_CONFIG } from 'src/common/config/server.config'

const { header, details, trailer } = FILE_MOCK_DATA
const { FILE_CREATED_PATH, FILE_CREATION_ENVIROMENT, FILE_TYPE_APPLICATION } = SERVER_CONFIG

const { FILE_NAME_PREFIX, FILE_TRANSACTION_CODE } = COMMON_CONSTANT

const { HEADER_TRAN_CODE, DETAIL_TRAN_CODE, TRAILER_TRAN_CODE } = FILE_TRANSACTION_CODE

@Injectable()
export class FileCreateService {
  /* ========= PUBLIC ENTRY ========= */
  constructor(private fileTransferClientService: FileTransferClientService) {}
  async createFile(
    header: CraHeader,
    details: CraDetail[],
    trailer: CraTrailer,
    craUserId: string = 'testuser',
  ): Promise<void> {
    const lines: string[] = []

    lines.push(this.buildHeader(header))

    for (const d of details) {
      lines.push(this.buildDetail(d))
    }

    lines.push(this.buildTrailer(trailer))

    console.log('file content', lines.join('\n'))

    const fileExists = existsSync(FILE_CREATED_PATH)
    if (!fileExists) {
      mkdirSync(FILE_CREATED_PATH, { recursive: true })
    }
    const fileName = this.createfileName(craUserId)
    const outputPath = FILE_CREATED_PATH + fileName

    console.log('outputPath', outputPath)
    writeFileSync(outputPath, lines.join('\n'), 'utf8')

    console.log(`File written to ${outputPath}`)

    const fileTransferResponse = await this.fileTransferClientService.sendFileToTransferService(
      outputPath,
      fileName,
      craUserId,
    )
    if (fileTransferResponse.statusCode === 226) {
      console.log('File transfer successful')
      // update DB recort csa status and batch status
    } else {
      console.error('File transfer failed', fileTransferResponse)
      // Retry or update DB record csa status and batch status
    }
    console.log('File transfer result:', fileTransferResponse)
  }

  /* ========= HEADER 6133 ========= */
  private buildHeader(h: CraHeader): string {
    return (
      this.padRight(HEADER_TRAN_CODE, 4) +
      this.padRight(h.version, 5) +
      this.padRight(h.processDate, 8) +
      this.padRight(h.businessNum, 15) +
      this.padLeftZero(h.recordCount, 8)
    )
  }

  /* ========= DETAIL 6134 ========= */
  private buildDetail(d: CraDetail): string {
    return (
      this.padRight(DETAIL_TRAN_CODE, 4) +
      this.padRight(d.referenceNum, 20) +
      this.padRight(d.businessNum, 15) +
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
      this.padRight(d.prevRecipSin, 9) +
      this.padRight(d.filler1, 6) +
      this.padRight(d.prevRecipGivenName, 30) +
      this.padRight(d.prevRecipSurName, 30) +
      this.padRight(d.appStartDate, 8) +
      this.padRight(d.newBornCode, 1) +
      this.padRight(d.cancelEndDate, 8) +
      this.padRight(d.cancelReasonCode, 2) +
      this.padRight(d.ccraDinNum, 9)
    )
  }

  /* ========= TRAILER 6135 ========= */
  private buildTrailer(t: CraTrailer): string {
    return (
      this.padRight(TRAILER_TRAN_CODE, 4) +
      this.padRight(t.version, 5) +
      this.padRight(t.processDate, 8) +
      this.padRight(t.businessNum, 15) +
      this.padLeftZero(t.recordCount, 8)
    )
  }

  /* ========= HELPERS ========= */
  private padRight(value: string, length: number): string {
    return (value ?? '').padEnd(length, ' ')
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

    return `${FILE_NAME_PREFIX}.${FILE_CREATION_ENVIROMENT}.${craUserId}.${FILE_TYPE_APPLICATION}${incrementNumber}.txt`
  }
}

const creator = new FileCreateService(new FileTransferClientService())

creator.createFile(header, details, trailer)
