// enum TranType {
//   CANCEL = '1',
//   APPLICATION = '2',
// }

export interface CraHeader {
  tranCode: string // 6133
  version: string // V00.0
  processDate: string // YYYYMMDD
  businessNum: string // 15
  recordCount: number // header = 6133V00.020260110885633354RA000100000002
}
export interface CraDetail {
  tranCode: string // Record type (detail)
  referenceNum: string // Ministry file reference ID
  businessNum: string // CRA business number
  tranType: string // 1 = Cancellation, 2 = Application

  childGivenName: string // Child first name
  childInitial: string // Child middle initial
  childSurName: string // Child last name

  childGivenNameAka: string // Child alternate first name
  childSurNameAka: string // Child alternate last name

  childBirthDate: string // Child birth date (YYYYMMDD)
  childSex: string // Child gender code
  childBirthCity: string // Child birth city
  childBirthProv: string // Child birth province code
  childBirthCountry: string // Child birth country code

  prevRecipSin: string // Social Insurance Number (SIN) of the previous benefit recipient
  filler1: string // Blank filler field used only to keep CRA file format aligned
  prevRecipGivenName: string // Previous recipient first name
  prevRecipSurName: string // Previous recipient last name

  appStartDate: string // Benefit start date
  newBornCode: string // Newborn indicator (Y/N)

  cancelEndDate: string // Cancellation end date
  cancelReasonCode: string // Cancellation reason code

  ccraDinNum: string // CRA document ID number
}

export interface CraTrailer {
  tranCode: string
  version: string
  processDate: string
  businessNum: string
  recordCount: number
}
