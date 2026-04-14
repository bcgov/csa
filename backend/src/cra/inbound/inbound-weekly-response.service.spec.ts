import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { InboundWeeklyResponseService } from './inbound-weekly-response.service'

//  Mock fs
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}))

//  Mock constants
vi.mock('../cra.constant', () => ({
  CRA_DATA_HANDLING_CONSTANT: {
    WEEKLY_FILE: {
      RECEIVE_MODE: {
        ELECTQRONIC: 'E',
      },
      RECORD_TYPE_CODE: {
        DATA_RECORD: '613704',
      },
    },
  },
}))

describe('InboundWeeklyResponseService', () => {
  let service: InboundWeeklyResponseService

  beforeEach(() => {
    service = new InboundWeeklyResponseService()
    // vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should parse only electronic detail records', () => {
    const mockFileContent = `
613704;A     ;E     ;123456789;FIRST NAME                    ;        ;LAST NAME                     ;M   ;20000101  ;CITY                        ;BC               ;CA              ;20200101   ;20220101 ;21    ;completed  ;20220102         ;
613704;C     ;      ;987654321;FIRST NAME                    ;        ;LAST NAME                     ;F   ;20000202  ;CITY                        ;BC               ;CA              ;20200202   ;20220202 ;21    ;completed  ;20220203         ;
613704;U     ;E     ;111111111;FIRST NAME                    ;        ;LAST NAME                     ;M   ;20000303  ;CITY                        ;BC               ;CA              ;20200303   ;20220303 ;21    ;completed  ;20220304         ;
`.trim()

    ;(readFileSync as any).mockReturnValue(mockFileContent)

    const result = service.parseWeeklyResponseFile('dummy-path')

    expect(result.detailRecords.length).toBe(2) // only E records

    const first = result.detailRecords[0]

    expect(first.tranCode).toBe('6137')
    expect(first.recordTypeCode).toBe('04')
    expect(first.transactionType).toBe('A')
    expect(first.receiveMode).toBe('E')
    expect(first.childDin).toBe('123456789')
    expect(first.childSex).toBe('M')
    expect(first.childBirthDate).toBe('20000101')
    expect(first.childBirthProv).toBe('BC')
    expect(first.childBirthCountry).toBe('CA')
    expect(first.careEndReasonCode).toBe('21')
    expect(first.status).toBe('completed')
    expect(first.completionDate).toBe('20220102')
  })

  it('should return empty array if no electronic records found', () => {
    const mockFileContent = `
613704;A     ;      ;123456789;FIRST NAME                    ;        ;LAST NAME                     ;M   ;20000101  ;CITY                        ;BC               ;CA              ;20200101   ;20220101 ;21    ;completed  ;20220102         ;
`.trim()

    ;(readFileSync as any).mockReturnValue(mockFileContent)

    const result = service.parseWeeklyResponseFile('dummy-path')

    expect(result.detailRecords.length).toBe(0)
  })

  it('should correctly parse parseFile method', () => {
    const service = new InboundWeeklyResponseService()

    const line =
      '613704;A     ;E     ;123456789;FIRST NAME                    ;        ;LAST NAME                     ;M   ;20000101  ;CITY                        ;BC               ;CA              ;20200101   ;20220101 ;21    ;completed  ;20220102         ;'

    const result = service.parseFile(line)

    expect(result.tranCode).toBe('6137')
    expect(result.recordTypeCode).toBe('04')
    expect(result.transactionType).toBe('A')
    expect(result.receiveMode).toBe('E')
    expect(result.childDin).toBe('123456789')
    expect(result.childSex).toBe('M')
    expect(result.childBirthDate).toBe('20000101')
    expect(result.childBirthCity.trim()).toBe('CITY')
    expect(result.childBirthProv).toBe('BC')
    expect(result.childBirthCountry).toBe('CA')
    expect(result.careStartDate).toBe('20200101')
    expect(result.careEndDate).toBe('20220101')
    expect(result.careEndReasonCode).toBe('21')
    expect(result.status).toBe('completed')
    expect(result.completionDate).toBe('20220102')
  })
})
