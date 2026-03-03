import { Injectable } from '@nestjs/common'
import { pacificTodayISO } from 'src/common/utils'
import { readFileSync } from 'fs'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import {
  CraResDetail,
  CraResHeader,
  CraResTrailer,
  DETAIL_OUTCOME,
  DetailResult,
} from './inbound.interface'

const { RESPONSE_FILE, ERROR_MESSAGE, FILE_STAT_CODE, TRAN_STAT_CODE } = CRA_DATA_HANDLING_CONSTANT
const { FILE_STAT_MESSAGE, REJECT_CODE } = ERROR_MESSAGE

@Injectable()
export class InboundResponseService {
  parseFile(filePath: string): {
    header: CraResHeader
    details: CraResDetail[]
    trailer: CraResTrailer
  } {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n').filter(Boolean)

    // Response File Type checking
    const tranCode = parseInt(lines[0]?.substring(0, 4))
    if (tranCode === RESPONSE_FILE.HEADER_TRAN_CODE) {
      return this.parseResponseFile(lines)
    }

    throw new Error(
      `Unrecognized CRA response file format: expected header tran code ${RESPONSE_FILE.HEADER_TRAN_CODE}, got ${tranCode}`,
    )
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
      const tranCode = parseInt(line?.substring(0, 4))

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
    return line?.substring(start, start + length).trim()
  }

  private parseHeader(line: string): CraResHeader {
    return {
      tranCode: this.slice(line, 0, 4), // 6118
      versionNum: this.slice(line, 4, 5),
      processDate: this.slice(line, 9, 8),
      businessNum: this.slice(line, 17, 15),
      recordCount: parseInt(this.slice(line, 32, 8), 10),
    }
  }
  private parseDetail(line: string): CraResDetail {
    return {
      tranCode: parseInt(this.slice(line, 0, 4), 10),
      fileStatCd: this.slice(line, 4, 2),
      tranStatCd: this.slice(line, 6, 1),
      rejectCd1: this.slice(line, 7, 3),
      rejectCd2: this.slice(line, 10, 3),
      rejectCd3: this.slice(line, 13, 3),
      rejectCd4: this.slice(line, 16, 3),
      rejectCd5: this.slice(line, 19, 3),

      outTranCode: parseInt(this.slice(line, 22, 4), 10),
      referenceNum: this.slice(line, 26, 20),
      businessNum: this.slice(line, 46, 15),
      tranType: parseInt(this.slice(line, 61, 1), 10),

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
      tranCode: this.slice(line, 0, 4), // 6120
      versionNum: this.slice(line, 4, 5),
      processDate: this.slice(line, 9, 8),
      businessNum: this.slice(line, 17, 15),
      recordCount: parseInt(this.slice(line, 32, 8), 10),
    }
  }

  isFileStatusOk(detail: CraResDetail): boolean {
    return detail.fileStatCd === FILE_STAT_CODE.FILE_OK
  }

  returnAllRejectCode(detail: CraResDetail): string[] {
    const rejectCodes: string[] = []
    const keys = ['rejectCd1', 'rejectCd2', 'rejectCd3', 'rejectCd4', 'rejectCd5'] as const
    for (const key of keys) {
      if (detail[key]) {
        rejectCodes.push(detail[key])
      }
    }
    return rejectCodes
  }

  getErrorMessageByRejectCode(rejectCodes: string[]): string {
    const errorMessages: string[] = []
    for (const rejectCode of rejectCodes) {
      if (REJECT_CODE[rejectCode]) {
        errorMessages.push(REJECT_CODE[rejectCode])
      }
    }
    return errorMessages.join('; ')
  }

  buildSystemComment(newMessage: string | null, existingComments: string | null): string | null {
    if (!newMessage) return existingComments
    const date = pacificTodayISO()
    const dated = `[${date}] ${newMessage}`
    return existingComments ? `${dated}\n${existingComments}` : dated
  }

  getBatchSystemCommentByCode(fileStatCd: string): string {
    if (FILE_STAT_MESSAGE[fileStatCd]) {
      return FILE_STAT_MESSAGE[fileStatCd]
    }
    return 'Unknown error code'
  }

  classifyDetail(detail: CraResDetail, existingComments: string | null): DetailResult {
    // TODO: FILE_ERROR not covered in FD. Confirm how file-level CRA errors should be handled
    // Currently treated as REJECTED.
    if (!this.isFileStatusOk(detail)) {
      const fileError = this.getBatchSystemCommentByCode(detail.fileStatCd)
      return {
        outcome: DETAIL_OUTCOME.FILE_ERROR,
        systemComments: this.buildSystemComment(fileError, existingComments),
        din: null,
      }
    }

    const rejectCodes = this.returnAllRejectCode(detail)
    const errorMessage = this.getErrorMessageByRejectCode(rejectCodes)
    const systemComments = this.buildSystemComment(errorMessage || null, existingComments)
    const din = detail.ccraDinNum?.trim() || null

    if (detail.tranStatCd === TRAN_STAT_CODE.TRAN_ACCEPTED) {
      return { outcome: DETAIL_OUTCOME.ACCEPTED, systemComments, din }
    }

    if (detail.tranStatCd === TRAN_STAT_CODE.TRAN_RECYCLED) {
      return { outcome: DETAIL_OUTCOME.RECYCLED, systemComments, din: null }
    }

    // REJECTED, PROBLEM_DETECTED, NOT_SET, or any unknown code
    return { outcome: DETAIL_OUTCOME.REJECTED, systemComments, din: null }
  }
}
