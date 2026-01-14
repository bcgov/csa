import { Injectable } from '@nestjs/common'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { COMMON_CONSTANT } from 'src/common/constant/common.constant'
import { CraDetail, CraHeader, CraTrailer } from '../common/interfaces/file.interface'
import { FileTransferClientService } from './fileTransfer.service'

const {
  FILE_CREATED_PATH,
  FILE_CREATION_ENVIROMENT,
  FILE_NAME_PREFIX,
  FILE_TYPE_APPLICATION,
  FILE_TRANSACTION_CODE,
} = COMMON_CONSTANT

const { HEADER_TRAN_CODE, DETAIL_TRAN_CODE, TRAILER_TRAN_CODE } = FILE_TRANSACTION_CODE

@Injectable()
export class FileCreationService {
  // DATA FOR TESTING PURPOSES
  header = {
    tranCode: HEADER_TRAN_CODE,
    version: '1.1.0',
    processDate: this.currentDate(), // YYYYMMDD
    businessNum: '885633354RA0001', // 15 chars
    recordCount: 0, // must match detail records
  }
  // 6133V00.020260110885633354RA000100000002
  details = [
    {
      tranCode: DETAIL_TRAN_CODE,
      referenceNum: 'REF00000000000001',
      businessNum: '885633354RA0001',
      tranType: '2', // 2 = Application

      childGivenName: 'JOHN',
      childInitial: 'D',
      childSurName: 'DOE',

      childGivenNameAka: '',
      childSurNameAka: '',

      childBirthDate: '20200115',
      childSex: 'M',
      childBirthCity: 'TORONTO',
      childBirthProv: 'ON',
      childBirthCountry: 'CA',

      prevRecipSin: '123456789', // Previous Recipient Social Insurance Number (SIN)
      filler1: '', // Always blank for CRA future use

      prevRecipGivenName: 'MARY', // Previous Recipient Given Name
      prevRecipSurName: 'DOE', // Previous Recipient Surname

      appStartDate: '20260101',
      newBornCode: 'Y', // Y = Yes N = No

      cancelEndDate: '',
      cancelReasonCode: '',
      ccraDinNum: '987654321', // CCRA Document Identification Number
    },
  ]

  trailer = {
    tranCode: TRAILER_TRAN_CODE,
    version: '1.1.0',
    processDate: this.currentDate(),
    businessNum: '885633354RA0001',
    recordCount: this.details.length,
  }

  // END DATA FOR TESTING PURPOSES

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

  // reverse engineering test

  private slice(line: string, start: number, length: number): string {
    return line.substring(start, start + length).trim()
  }

  private parseHeader(line: string): CraHeader {
    return {
      tranCode: this.slice(line, 0, 4), // 6133
      version: this.slice(line, 4, 5),
      processDate: this.slice(line, 9, 8),
      businessNum: this.slice(line, 17, 15),
      recordCount: parseInt(this.slice(line, 32, 8), 10),
    }
  }
  private parseDetail(line: string): CraDetail {
    return {
      tranCode: '6134',

      referenceNum: this.slice(line, 4, 20),
      businessNum: this.slice(line, 24, 15),
      tranType: this.slice(line, 39, 1) as '1' | '2',

      childGivenName: this.slice(line, 40, 30),
      childInitial: this.slice(line, 70, 1),
      childSurName: this.slice(line, 71, 30),

      childGivenNameAka: this.slice(line, 101, 30),
      childSurNameAka: this.slice(line, 131, 30),

      childBirthDate: this.slice(line, 161, 8),
      childSex: this.slice(line, 169, 1),
      childBirthCity: this.slice(line, 170, 28),
      childBirthProv: this.slice(line, 198, 2),
      childBirthCountry: this.slice(line, 200, 2),

      prevRecipSin: this.slice(line, 202, 9),
      filler1: this.slice(line, 211, 6),
      prevRecipGivenName: this.slice(line, 217, 30),
      prevRecipSurName: this.slice(line, 247, 30),

      appStartDate: this.slice(line, 277, 8),
      newBornCode: this.slice(line, 285, 1),

      cancelEndDate: this.slice(line, 286, 8),
      cancelReasonCode: this.slice(line, 294, 2),

      ccraDinNum: this.slice(line, 296, 9),
    }
  }

  private parseTrailer(line: string): CraTrailer {
    return {
      tranCode: this.slice(line, 0, 4), // 6135
      version: this.slice(line, 4, 5),
      processDate: this.slice(line, 9, 8),
      businessNum: this.slice(line, 17, 15),
      recordCount: parseInt(this.slice(line, 32, 8), 10),
    }
  }

  parseFile(filePath: string): {
    header: CraHeader
    details: CraDetail[]
    trailer: CraTrailer
  } {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n').filter(Boolean)

    let header!: CraHeader
    let trailer!: CraTrailer
    const details: CraDetail[] = []

    for (const line of lines) {
      const tranCode = line.substring(0, 4)

      if (tranCode === '6133') {
        header = this.parseHeader(line)
      } else if (tranCode === '6134') {
        details.push(this.parseDetail(line))
      } else if (tranCode === '6135') {
        trailer = this.parseTrailer(line)
      }
    }

    return { header, details, trailer }
  }
}

// const creator = new FileCreationService(new FileTransferClientService());

// creator.createFile(creator.header, creator.details, creator.trailer);

// test parsing
// const parsed = creator.parseFile(outputPath);
// console.log('parsed file', JSON.stringify(parsed, null, 2));
