// ENUMS

export enum TranCode {
  HEADER = '6136',
  DETAIL = '6137',
  TRAILER = '6138',
}

export enum RecordTypeCode {
  HEADER = '00',
  DETAIL_01 = '01',
  DETAIL_02 = '02',
  DETAIL_03 = '03',
  DETAIL_04 = '04',
  DETAIL_05 = '05',
}

// BASE

interface BaseRecord {
  tranCode: TranCode
  recordTypeCode: RecordTypeCode
}

// HEADER RECORD

export interface HeaderRecord extends BaseRecord {
  tranCode: TranCode.HEADER
  recordTypeCode: RecordTypeCode.HEADER
  filler1: string // X(08)
  processDate: string // X(08) YYYYMMDD
  filler2: string // X(219)
}

// DETAIL 01

export interface DetailRecord01 extends BaseRecord {
  tranCode: TranCode.DETAIL
  recordTypeCode: RecordTypeCode.DETAIL_01
  agencyName: string
  businessNumber: string
}

// DETAIL 02

export interface DetailRecord02 extends BaseRecord {
  tranCode: TranCode.DETAIL
  recordTypeCode: RecordTypeCode.DETAIL_02
  fromTimestamp: string // YYYY-MM-DD-HH.MM
  toTimestamp: string
}

// DETAIL 03 (STATIC HEADER ROW)

export interface DetailRecord03 extends BaseRecord {
  tranCode: TranCode.DETAIL
  recordTypeCode: RecordTypeCode.DETAIL_03
}

// COMMON ENUM TYPES

export type ApplicationType = 'A' | 'C' | 'U'
export type ReceiveMode = 'E' | ' '
export type Sex = 'M' | 'F' | 'X'

export type ProvinceCode =
  | 'ON'
  | 'QC'
  | 'NB'
  | 'BC'
  | 'AB'
  | 'SK'
  | 'MB'
  | 'NS'
  | 'NF'
  | 'PE'
  | 'NT'
  | 'YT'
  | 'NU'
  | '  '

export type CareEndReasonCode = '14' | '21' | '22' | '23' | '29'

export type Status = 'abandoned' | 'completed' | 'in-progress' | 'updated' | 'pending' | 'active'

// DETAIL 04 (MAIN)

interface DetailRecord04Base extends BaseRecord {
  tranCode: TranCode.DETAIL
  recordTypeCode: RecordTypeCode.DETAIL_04

  transactionType: ApplicationType
  receiveMode: ReceiveMode
  [key: `filler${number}`]: string
  childDin: string

  childGivenName: string
  childInitial: string
  childSurName: string

  childSex: Sex

  childBirthDate: string
  childBirthCity: string
  childBirthProv: ProvinceCode
  childBirthCountry: string

  careStartDate: string
  careEndDate: string
  careEndReasonCode: CareEndReasonCode

  status: Status
  completionDate: string
}

export interface ApplicationRecord extends DetailRecord04Base {
  transactionType: 'A'
}

export interface CancellationRecord extends DetailRecord04Base {
  transactionType: 'C'
}

export interface UpdateRecord extends DetailRecord04Base {
  transactionType: 'U'
}

export type DetailRecord04 = ApplicationRecord | CancellationRecord | UpdateRecord

// DETAIL 05
export interface DetailRecord05 extends BaseRecord {
  tranCode: TranCode.DETAIL // X(04)
  recordTypeCode: RecordTypeCode.DETAIL_05 // X(02)
  filler1: string // X(35)
  nextDate: string // X(10)  YYYY-MM-DD
  filler2: string // X(04)
  nextTime: string // X(05) HH.MM
  filler3: string // X(59)
  nextMonth: string // X(09)
  filler4: string // X(01)
  filler5: string // X(112)
}

// TRAILER RECORD

export interface TrailerRecord extends BaseRecord {
  tranCode: TranCode.TRAILER // X(04)
  recordTypeCode: RecordTypeCode.HEADER // X(02)
  filler1: string // X(09)
  recordCount: number // 9(09)
  filler2: string // X(217)
}

// BLANK RECORD

export interface BlankRecord extends BaseRecord {
  tranCode: TranCode.DETAIL
  recordTypeCode: RecordTypeCode.HEADER // '00'
}

// MASTER UNION

export type WeeklyReportRecord =
  | HeaderRecord
  | DetailRecord01
  | DetailRecord02
  | DetailRecord03
  | DetailRecord04
  | DetailRecord05
  | TrailerRecord
  | BlankRecord
