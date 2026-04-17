import { readFileSync } from 'fs'
import path from 'path'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { AppLogger } from 'src/common/logger/app-logger'
import {
  DetailRecord04,
  HeaderRecord,
  TrailerRecord,
  TranCode,
  RecordTypeCode,
  ApplicationType,
  ReceiveMode,
  Sex,
  ProvinceCode,
  CareEndReasonCode,
  Status,
} from './inbound-weekly.interface'

const { WEEKLY_FILE } = CRA_DATA_HANDLING_CONSTANT

const { RECEIVE_MODE, RECORD_TYPE_CODE } = WEEKLY_FILE

export class InboundWeeklyResponseService {
  protected readonly logger = new AppLogger(InboundWeeklyResponseService.name)
  private totalDetailsRecords = 0
  private readonly detailRecords: DetailRecord04[] = []
  private headerRecord: HeaderRecord
  private trailerRecord: TrailerRecord
  private reporttitle1: string
  private reporttitle2: string
  private trailerMessage: string

  parseWeeklyResponseFile(filePath: string): {
    details: DetailRecord04[]
    header: HeaderRecord
    trailer: TrailerRecord
  } {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n').filter(Boolean)
    for (const line of lines) {
      const headerRecord = line.startsWith(RECORD_TYPE_CODE.HEADER_RECORD)
      const reporttitle1 = line.startsWith(RECORD_TYPE_CODE.REPORT_TITLE_RECORD)
      const reporttitle2 = line.startsWith(RECORD_TYPE_CODE.REPORT_DATE_RANGE_RECORD)
      const detailDataRecord = line.startsWith(RECORD_TYPE_CODE.DATA_RECORD)
      const trailerMessage = line.startsWith(RECORD_TYPE_CODE.TRAILER_MESSAGE)
      const trailerRecord = line.startsWith(RECORD_TYPE_CODE.TRAILER_RECORD)
      const elcetronicRecord = line.slice(14, 15) === RECEIVE_MODE.ELECTQRONIC

      if (headerRecord) {
        this.headerRecord = this.parseHeader(line)
      } else if (reporttitle1) {
        this.reporttitle1 = line
      } else if (reporttitle2) {
        this.reporttitle2 = line
      } else if (detailDataRecord && elcetronicRecord) {
        const eachDetail = this.parseDetail(line)
        this.detailRecords.push(eachDetail)
        this.totalDetailsRecords++
      } else if (trailerMessage) {
        this.trailerMessage = line
      } else if (trailerRecord) {
        this.trailerRecord = this.parseTrailer(line)
      }
    }

    this.logger.log(
      `Weekly Response File Summary:\n   
       Weekly Response File = ${path?.basename(filePath)}\n
       Report Title2 = ${this.reporttitle2}\n 
       Total Records in File = ${this.trailerRecord?.recordCount}\n
       Total Electronic records = ${this.totalDetailsRecords}\n
       Trailer Message = ${this.trailerMessage}`,
    )
    return { header: this.headerRecord, details: this.detailRecords, trailer: this.trailerRecord }
  }

  parseDetail(line: string): DetailRecord04 {
    return {
      tranCode: line.substring(0, 4) as TranCode.DETAIL, // X(04)
      recordTypeCode: line.substring(4, 6) as RecordTypeCode.DETAIL_04, // X(02)
      filler1: line.substring(6, 7), // X(01)
      transactionType: line.substring(7, 8) as ApplicationType, // X(01)

      filler2: line.substring(8, 13), // X(05)
      filler3: line.substring(13, 14), // X(01)

      receiveMode: line.substring(14, 15) as ReceiveMode, // X(01)

      filler4: line.substring(15, 20), // X(05)
      filler5: line.substring(20, 21), // X(01)

      childDin: line.substring(21, 30), // X(09)
      filler6: line.substring(30, 31), // X(01)

      childGivenName: line.substring(31, 61).trim(), // X(30)
      filler7: line.substring(61, 62), // X(01)

      childInitial: line.substring(62, 63).trim(), // X(01)
      filler8: line.substring(63, 70), // X(07)
      filler9: line.substring(70, 71), // X(01)

      childSurName: line.substring(71, 101).trim(), // X(30)
      filler10: line.substring(101, 102), // X(01)

      childSex: line.substring(102, 103) as Sex, // X(01)
      filler11: line.substring(103, 106), // X(03)
      filler12: line.substring(106, 107), // X(01)

      childBirthDate: line.substring(107, 115).trim(), // X(08)

      filler13: line.substring(115, 117), // X(02)
      filler14: line.substring(117, 118), // X(01)

      childBirthCity: line.substring(118, 146).trim(), // X(28)
      filler15: line.substring(146, 147), // X(01)

      childBirthProv: line.substring(147, 149) as ProvinceCode, // X(02)

      filler16: line.substring(149, 164), // X(15)
      filler17: line.substring(164, 165), // X(01)

      childBirthCountry: line.substring(165, 167).trim(), // X(02)

      filler18: line.substring(167, 181), // X(14)
      filler19: line.substring(181, 182), // X(01)

      careStartDate: line.substring(182, 190), // X(08)

      filler20: line.substring(190, 193), // X(03)
      filler21: line.substring(193, 194), // X(01)

      careEndDate: line.substring(194, 202), // X(08)

      filler22: line.substring(202, 203), // X(01)
      filler23: line.substring(203, 204), // X(01)

      careEndReasonCode: line.substring(204, 206) as CareEndReasonCode, // X(02)

      filler24: line.substring(206, 210), // X(04)
      filler25: line.substring(210, 211), // X(01)

      status: line.substring(211, 222).trim() as Status, // X(11)

      filler26: line.substring(222, 223), // X(01)

      completionDate: line.substring(223, 231), // X(08)

      filler27: line.substring(231, 240), // X(09)
      filler28: line.substring(240, 241), // X(01)
    }
  }

  parseHeader(line: string): HeaderRecord {
    return {
      tranCode: line?.substring(0, 4) as TranCode.HEADER, // X(04)
      recordTypeCode: line?.substring(4, 6) as RecordTypeCode.HEADER, // X(02)
      filler1: line?.substring(6, 14), // X(08)
      processDate: line?.substring(14, 22), // X(08) YYYYMMDD
      filler2: line?.substring(22, 241), // X(219)
    }
  }

  parseTrailer(line: string): TrailerRecord {
    return {
      tranCode: line?.substring(0, 4) as TranCode.TRAILER, // X(04)
      recordTypeCode: line?.substring(4, 6) as RecordTypeCode.HEADER, // X(02)
      filler1: line?.substring(6, 15), // X(09)
      recordCount: parseInt(line?.substring(15, 24), 10), // 9(09)
      filler2: line?.substring(24, 241), // X(217)
    }
  }
}
