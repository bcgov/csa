import { describe, it, expect, beforeEach, vi } from 'vitest'
import { InboundWeeklyResponseService } from './inbound-weekly-response.service'
import * as fs from 'fs'

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}))

describe('InboundWeeklyResponseService', () => {
  let service: InboundWeeklyResponseService

  beforeEach(() => {
    service = new InboundWeeklyResponseService()
    vi.clearAllMocks() // ✅ keep mocks, just reset calls
  })

  const mockFilePath = '/tmp/test-file.txt'

  const buildLine = (prefix: string, length = 241) =>
    (prefix + ''.padEnd(length, ' ')).substring(0, length)

  const buildDetailLine = (receiveMode = 'E') => {
    let line = ''.padEnd(241, ' ')
    line = line.substring(0, 0) + '6137' + line.substring(4)
    line = line.substring(0, 4) + '04' + line.substring(6)
    line = line.substring(0, 14) + receiveMode + line.substring(15)
    line = line.substring(0, 21) + '123456789' + line.substring(30)
    return line
  }
  const buildTrailerLine = (count: number) => {
    let line = ''.padEnd(241, ' ')
    line = line.substring(0, 0) + '6138' + line.substring(4) // tranCode
    line = line.substring(0, 4) + '00' + line.substring(6) // recordTypeCode

    const recordCount = String(count).padStart(9, '0')
    line = line.substring(0, 15) + recordCount + line.substring(24)

    return line
  }

  const buildHeaderLine = (processDate: string = '20260416') => {
    let line = ''.padEnd(241, ' ')
    line = line.substring(0, 0) + '6136' + line.substring(4)
    line = line.substring(0, 4) + '00' + line.substring(6)
    line = line.substring(0, 14) + processDate + line.substring(22)
    return line
  }

  it('should parse header, electronic details, and trailer correctly', () => {
    const fileContent = [buildHeaderLine('6136'), buildDetailLine('E'), buildTrailerLine(3)].join(
      '\n',
    )

    ;(fs.readFileSync as any).mockReturnValue(fileContent)

    const result = service.parseWeeklyResponseFile(mockFilePath)

    expect(result.header).toBeDefined()
    expect(result.trailer).toBeDefined()
    expect(result.details.length).toBe(1)
    expect(result.details[0].childDin.trim()).toBe('123456789')
    expect(result.trailer.recordCount).toBe(3)
  })

  it('should filter only electronic (E) records', () => {
    const fileContent = [
      buildLine('0000'),
      buildDetailLine('E'),
      buildDetailLine('P'),
      '9999TR' + ' '.repeat(9) + '000000002' + ' '.repeat(241 - 24),
    ].join('\n')

    ;(fs.readFileSync as any).mockReturnValue(fileContent)

    const result = service.parseWeeklyResponseFile(mockFilePath)

    expect(result.details.length).toBe(1)
    expect(result.details[0].receiveMode).toBe('E')
  })

  it('should parse detail fields correctly', () => {
    const fileContent = [buildDetailLine('E')].join('\n')

    ;(fs.readFileSync as any).mockReturnValue(fileContent)

    const result = service.parseWeeklyResponseFile(mockFilePath)
    const detail = result.details[0]

    expect(detail.tranCode).toBe('6137')
    expect(detail.recordTypeCode).toBe('04')
    expect(detail.receiveMode).toBe('E')
    expect(detail.childDin.trim()).toBe('123456789')
  })

  it('should parse header correctly', () => {
    const headerLine = buildHeaderLine('20260416')
    const fileContent = [headerLine].join('\n')

    ;(fs.readFileSync as any).mockReturnValue(fileContent)

    const result = service.parseWeeklyResponseFile(mockFilePath)

    expect(result.header.processDate).toBe('20260416')
  })

  it('should parse trailer recordCount correctly', () => {
    const trailerLine = buildTrailerLine(123)
    const fileContent = [buildLine('6138'), trailerLine].join('\n')

    ;(fs.readFileSync as any).mockReturnValue(fileContent)

    const result = service.parseWeeklyResponseFile(mockFilePath)
    expect(result.trailer.recordCount).toBe(123)
  })

  it('should handle file with no electronic records', () => {
    const fileContent = [
      buildLine('0000'),
      buildDetailLine('P'),
      '9999TR' + ' '.repeat(9) + '000000001',
    ].join('\n')

    ;(fs.readFileSync as any).mockReturnValue(fileContent)

    const result = service.parseWeeklyResponseFile(mockFilePath)

    expect(result.details.length).toBe(0)
  })

  it('should log summary after parsing', () => {
    const logSpy = vi.spyOn(service['logger'], 'log')

    const fileContent = [buildLine('0000'), '9999TR' + ' '.repeat(9) + '000000000'].join('\n')

    ;(fs.readFileSync as any).mockReturnValue(fileContent)

    service.parseWeeklyResponseFile(mockFilePath)

    expect(logSpy).toHaveBeenCalled()
  })
})
