// enum TranType {
//   CANCEL = '1',
//   APPLICATION = '2',
// }

export interface CraReqHeader {
  // header = 6133V00.020260110885633354RA000100000002
  tranCode: number | string // 9(04) 6133
  versionNum: string // V00.0
  processDate: string // X(8) YYYYMMDD
  businessNum: string // X(15)
  recordCount: number // 9(08) It includes header, tailer and details count
  filler: string
}
export interface CraReqDetail {
  tranCode: number | string // 9(04) 6134 Record type (detail)
  referenceNum: string // X(20) Ministry file reference ID
  businessNum: string //X(15) CRA business number
  tranType: number // 9(1) 1 = Cancellation, 2 = Application

  childGivenName: string // X(30) Child first name
  childInitial: string // X(1) first char of middle name
  childSurName: string // X(30) Child last name

  childGivenNameAka: string // X(30) Child alternate first name
  childSurNameAka: string // X(30) Child alternate last name

  childBirthDate: string // X(8) Child birth date (YYYYMMDD)
  childSex: string //X(1) [ M ,F ] Child gender code
  childBirthCity: string //  X(28) Child birth city
  childBirthProv: string // X(2) Child birth province code ON = Ontario
  childBirthCountry: string // X(2) Child birth country code CA = Canada

  prevRecipSin: string // X(9) Social Insurance Number (SIN) of the previous benefit recipient
  filler1: string // X(6) Blank filler field used only to keep CRA file format aligned
  prevRecipGivenName: string // X(30) Previous recipient first name
  prevRecipSurName: string // X(30) Previous recipient last name

  appStartDate: string // 9(08) Benefit start date
  newBornCode: string // X(1) Newborn indicator (Y/N)
  // FILLER2
  filler2: string // X(10)
  cancelEndDate: string // X(8) Cancellation end date
  cancelReasonCode: string // X(2) Cancellation reason code

  ccraDinNum: string // 9(9) CRA document ID number
  // FILLER3
  filler3: string // X(15)
  filler4?: string // X(15)
}

export interface CraReqTrailer {
  tranCode: number | string
  versionNum: string
  processDate: string
  businessNum: string
  recordCount: number
  filler?: string
}
