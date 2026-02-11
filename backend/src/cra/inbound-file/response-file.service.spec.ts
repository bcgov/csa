import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { ResponseFileService } from './response-file.service'
import { CRA_DATA_HANDLING_CONSTANT } from '../common/constants/cra.constant'

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}))

const { RESPONSE_FILE } = CRA_DATA_HANDLING_CONSTANT

describe('ResponseFileService', () => {
  let service: ResponseFileService

  beforeEach(() => {
    service = new ResponseFileService()
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
    expect(result.header.tranCode).toBe(RESPONSE_FILE.HEADER_TRAN_CODE)
    expect(result.header.recordCount).toBe(1)

    // ---- DETAILS ASSERTIONS ----
    expect(result.details).toHaveLength(1)

    const detail = result.details[0]
    expect(detail.tranCode).toBe(RESPONSE_FILE.DETAILS_TRAN_CODE)
    expect(detail.fileStatCd).toBe(1)
    expect(detail.tranStatCd).toBe(0)
    expect(detail.rejectCd1).toBe('ABC')
    expect(detail.referenceNum).toBeDefined()
    expect(detail.businessNum).toBeDefined()
    expect(detail.childGivenName).toBeDefined()
    expect(detail.childSurName).toBeDefined()
    expect(detail.childBirthDate).toBeDefined()
    expect(detail.ccraDinNum).toBeDefined()

    // ---- TRAILER ASSERTIONS ----
    expect(result.trailer).toBeDefined()
    expect(result.trailer.tranCode).toBe(RESPONSE_FILE.TRAILER_TRAN_CODE)
    expect(result.trailer.recordCount).toBe(1)
  })

  it('should call readFileSync with correct arguments', () => {
    ;(readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      '61180000120250101BN123456789012300000000\n',
    )

    service.parseFile('/test/file.txt')

    expect(readFileSync).toHaveBeenCalledWith('/test/file.txt', 'utf8')
  })
})
