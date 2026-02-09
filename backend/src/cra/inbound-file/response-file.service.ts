import { Injectable } from '@nestjs/common'
import { readFileSync } from 'fs'
import { CRA_DATA_HANDLING_CONSTANT } from '../common/constants/cra.constant'
import { CraResHeader, CraResDetail, CraResTrailer } from '../interfaces/response-file.interface'

const { RESPONSE_FILE } = CRA_DATA_HANDLING_CONSTANT

@Injectable()
export class ResponseFileService {
  // Helper method to slice field values

  parseFile(filePath: string): {
    header: CraResHeader
    details: CraResDetail[]
    trailer: CraResTrailer
  } {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n').filter(Boolean)

    // Response File Type checking
    const tranCode = parseInt(lines[0].substring(0, 4))
    if (tranCode === RESPONSE_FILE.HEADER_TRAN_CODE) {
      return this.parseResponseFile(lines)
    }
  }

  private parseResponseFile(lines: string[]): {
    header: CraResHeader
    details: CraResDetail[]
    trailer: CraResTrailer
  } {
    let header!: CraResHeader // ! = definite assignment assertion operator
    let trailer!: CraResTrailer
    const details: CraResDetail[] = []
    for (const line of lines) {
      const tranCode = parseInt(line.substring(0, 4))

      if (tranCode === RESPONSE_FILE.HEADER_TRAN_CODE) {
        header = this.parseHeader(line)
      } else if (tranCode === RESPONSE_FILE.DETAILS_TRAN_CODE) {
        details.push(this.parseDetail(line))
      } else if (tranCode === RESPONSE_FILE.TRAILER_TRAN_CODE) {
        trailer = this.parseTrailer(line)
      }
    }

    return { header, details, trailer }
  }

  private slice(line: string, start: number, length: number): string {
    return line.substring(start, start + length).trim()
  }

  private parseHeader(line: string): CraResHeader {
    return {
      tranCode: parseInt(this.slice(line, 0, 4),10), // 6118
      versionNum: this.slice(line, 4, 5),
      processDate: this.slice(line, 9, 8),
      businessNum: this.slice(line, 17, 15),
      recordCount: parseInt(this.slice(line, 32, 8), 10),
    }
  }
  private parseDetail(line: string): any {
    return {
      tranCode: parseInt(this.slice(line, 0, 4),10),
      fileStatCd: parseInt(this.slice(line, 4, 2),10),
      tranStatCd: parseInt(this.slice(line, 6, 1),10),
      rejectCd1: this.slice(line, 7, 3),
      rejectCd2: this.slice(line, 10, 3),
      rejectCd3: this.slice(line, 13, 3),
      rejectCd4: this.slice(line, 16, 3),
      rejectCd5: this.slice(line, 19, 3),

      outTranCode: parseInt(this.slice(line, 22, 4),10),
      referenceNum: this.slice(line, 26, 20),
      businessNum: this.slice(line, 46, 15),
      tranType: parseInt(this.slice(line, 61, 1),10 ),

      childGivenName: this.slice(line, 62, 30),
      childInitial: this.slice(line, 92, 1),
      childSurName: this.slice(line, 93, 30),

      childGivenNameAka: this.slice(line, 123, 30),
      childSurNameAka: this.slice(line, 153, 30),

      childBirthDate: this.slice(line, 183, 8),
      childSex: this.slice(line, 191, 1),
      childBirthCity: this.slice(line, 192, 28),
      childBirthProv: this.slice(line, 220, 2),
      childBirthCountry: this.slice(line, 222, 2),

      prevRecipSin: this.slice(line, 224, 9),
      filler1: this.slice(line, 233, 6),
      prevRecipGivenName: this.slice(line, 239, 30),
      prevRecipSurName: this.slice(line, 269, 30),

      appStartDate: this.slice(line, 299, 8),
      newBornCode: this.slice(line, 307, 1),

      cancelEndDate: this.slice(line, 308, 8),
      cancelReasonCode: this.slice(line, 316, 2),

      ccraDinNum: this.slice(line, 318, 9), // 327
    }
  }

  private parseTrailer(line: string): CraResTrailer {
    return {
      tranCode: parseInt(this.slice(line, 0, 4),10), // 6120
      versionNum: this.slice(line, 4, 5),
      processDate: this.slice(line, 9, 8),
      businessNum: this.slice(line, 17, 15),
      recordCount: parseInt(this.slice(line, 32, 8), 10),
    }
  }
}
