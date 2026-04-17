import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { InboundResponseService } from './inbound-response.service'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { CraResDetail, DETAIL_OUTCOME } from './inbound.interface'

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}))

const { RESPONSE_FILE } = CRA_DATA_HANDLING_CONSTANT

describe('InboundResponseService', () => {
  let service: InboundResponseService

  beforeEach(() => {
    service = new InboundResponseService()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should parse response file with header, detail and trailer correctly', () => {
    const mockFileContent = [
      // HEADER (6118)
      '61180000120250101BN123456789012300000001',
      // DETAIL (6119)
      '6119010ABCDEF123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789',
      // TRAILER (6120)
      '61200000120250101BN123456789012300000001',
    ].join('\n')

    ;(readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockFileContent)

    const result = service.parseFile('/fake/path/response.txt')

    // ---- HEADER ASSERTIONS ----
    expect(result.header).toBeDefined()
    expect(result.header.tranCode).toBe(RESPONSE_FILE.HEADER_TRAN_CODE.toString())
    expect(result.header.recordCount).toBe(1)

    // ---- DETAILS ASSERTIONS ----
    expect(result.details).toHaveLength(1)

    const detail = result.details[0]
    expect(detail.tranCode).toBe(RESPONSE_FILE.DETAILS_TRAN_CODE)
    expect(detail.fileStatCd).toBe('01')
    expect(detail.tranStatCd).toBe('0')
    expect(detail.rejectCd1).toBe('ABC')
    expect(detail.referenceNum).toBeDefined()
    expect(detail.businessNum).toBeDefined()
    expect(detail.childGivenName).toBeDefined()
    expect(detail.childSurName).toBeDefined()
    expect(detail.childBirthDate).toBeDefined()
    expect(detail.ccraDinNum).toBeDefined()

    // ---- TRAILER ASSERTIONS ----
    expect(result.trailer).toBeDefined()
    expect(result.trailer.tranCode).toBe(RESPONSE_FILE.TRAILER_TRAN_CODE.toString())
    expect(result.trailer.recordCount).toBe(1)
  })

  it('should call readFileSync with correct arguments', () => {
    ;(readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      '61180000120250101BN123456789012300000000\n',
    )

    service.parseFile('/test/file.txt')

    expect(readFileSync).toHaveBeenCalledWith('/test/file.txt', 'utf8')
  })

  describe('classifyDetail', () => {
    const { FILE_STAT_CODE, TRAN_STAT_CODE } = CRA_DATA_HANDLING_CONSTANT

    const makeDetail = (overrides: Partial<CraResDetail> = {}): CraResDetail => ({
      tranCode: 6119,
      fileStatCd: FILE_STAT_CODE.FILE_OK,
      tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED,
      rejectCd1: '',
      rejectCd2: '',
      rejectCd3: '',
      rejectCd4: '',
      rejectCd5: '',
      outTranCode: 6134,
      referenceNum: '100',
      businessNum: 'BN123456789',
      tranType: 2,
      childGivenName: 'John',
      childInitial: '',
      childSurName: 'Doe',
      childGivenNameAka: '',
      childSurNameAka: '',
      childBirthDate: '20200101',
      childSex: 'M',
      childBirthCity: 'Vancouver',
      childBirthProv: 'BC',
      childBirthCountry: 'CA',
      prevRecipSin: '',
      filler1: '',
      prevRecipGivenName: '',
      prevRecipSurName: '',
      appStartDate: '20240101',
      newBornCode: 'N',
      ccraDinNum: '',
      ...overrides,
    })

    it('should override RECYCLED to REJECTED when reject code is 999', () => {
      const detail = makeDetail({
        fileStatCd: FILE_STAT_CODE.FILE_OK,
        tranStatCd: TRAN_STAT_CODE.TRAN_RECYCLED,
        rejectCd1: '999',
      })

      const result = service.classifyDetail(detail, null)

      expect(result.outcome).toBe(DETAIL_OUTCOME.REJECTED)
    })

    it('should keep RECYCLED outcome for normal recycle code 998', () => {
      const detail = makeDetail({
        fileStatCd: FILE_STAT_CODE.FILE_OK,
        tranStatCd: TRAN_STAT_CODE.TRAN_RECYCLED,
        rejectCd1: '998',
      })

      const result = service.classifyDetail(detail, null)

      expect(result.outcome).toBe(DETAIL_OUTCOME.RECYCLED)
    })
  })

  describe('getErrorMessageByRejectCode', () => {
    it('should format reject codes with descriptions separated by semicolons', () => {
      const result = service.getErrorMessageByRejectCode(['007', '010'])

      expect(result).toBe(
        "007: The child's first name must be entered.; 010: The child's birth date must be entered.",
      )
    })
  })
})
