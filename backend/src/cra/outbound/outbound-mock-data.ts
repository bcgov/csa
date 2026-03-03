import { formatDatePacificCompact } from 'src/common/utils'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'

const { HEADER_TRAN_CODE, DETAIL_TRAN_CODE, TRAILER_TRAN_CODE } =
  CRA_DATA_HANDLING_CONSTANT.REQUEST_FILE

const currentDate = (): string => formatDatePacificCompact(new Date())

const details = [
  {
    tranCode: DETAIL_TRAN_CODE,
    referenceNum: 'REF00000000000001',
    businessNum: '885633354RA0001',
    tranType: 2, // 2 = Application

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
    filler1: '      ', // Always blank for CRA future use

    prevRecipGivenName: 'MARY', // Previous Recipient Given Name
    prevRecipSurName: 'DOE', // Previous Recipient Surname

    appStartDate: '20260101',
    newBornCode: 'Y', // Y = Yes N = No
    filler2: '          ',

    cancelEndDate: '',
    cancelReasonCode: '',
    ccraDinNum: '987654321', // CCRA Document Identification Number
    filler3: '               ',
  },
  {
    tranCode: DETAIL_TRAN_CODE,
    referenceNum: 'REF00000000000002',
    businessNum: '885633354RA0001',
    tranType: 1, // 2 = Application

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
    filler2: '',

    cancelEndDate: '',
    cancelReasonCode: '',
    ccraDinNum: '987654321', // CCRA Document Identification Number
    filler3: '',
  },
]

export const FILE_MOCK_DATA = {
  // DATA FOR TESTING PURPOSES
  header: {
    tranCode: HEADER_TRAN_CODE,
    versionNum: 'V00.0',
    processDate: currentDate(), // YYYYMMDD
    businessNum: '885633354RA0001', // 15 chars
    recordCount: 0, // must match detail records
    filler: '                         ',
  },
  // 6133V00.020260110885633354RA000100000002
  details: details,

  trailer: {
    tranCode: TRAILER_TRAN_CODE,
    versionNum: 'V00.0',
    processDate: currentDate(),
    businessNum: '885633354RA0001',
    recordCount: details.length,
    filler: '',
  },
}
