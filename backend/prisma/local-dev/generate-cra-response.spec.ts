import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { InboundResponseService } from '../../src/cra/inbound/inbound-response.service'
import { generateCraResponseFromOutbound } from './generate-cra-response'

describe('generateCraResponseFromOutbound', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('generates a parseable RSP file from an outbound request file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cra-response-'))
    tempDirs.push(tempDir)

    const outboundPath = path.join(tempDir, 'II.ACSAIN.TESTUSERID1.AAPL0001')
    fs.writeFileSync(
      outboundPath,
      [
        '6133V00.020260808TESTBN00000000100000000                         ',
        '61341-90000000005-5     TESTBN0000000012Fiona                          Nguyen                        Fiona                         Nguyen                        20150606FVancouver                   BCCA               Alex                          Admin                         20260101N                                  ',
        '6135V00.020260808TESTBN00000000100000003                         ',
      ].join('\n'),
      'utf8',
    )

    const inboundDir = path.join(tempDir, 'inbound')
    const result = generateCraResponseFromOutbound({
      outboundFilePath: outboundPath,
      inboundDir,
      outcome: 'accepted',
    })

    expect(result.responseFile).toBe('TESTUSERID1.ARSP0001')
    expect(result.detailCount).toBe(1)

    const parsed = new InboundResponseService().parseFile(result.responsePath)
    expect(parsed.details).toHaveLength(1)
    expect(parsed.details[0].referenceNum.trim()).toBe('1-90000000005-5')
    expect(parsed.details[0].tranStatCd).toBe('1')
    expect(parsed.details[0].ccraDinNum.trim()).not.toBe('')
  })

  it('supports mixed per-record outcomes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cra-response-mixed-'))
    tempDirs.push(tempDir)

    const outboundPath = path.join(tempDir, 'II.ACSAIN.TESTUSERID1.AAPL0001')
    fs.writeFileSync(
      outboundPath,
      [
        '6133V00.020260808TESTBN00000000100000000                         ',
        '61341-90000000005-5     TESTBN0000000012Fiona                          Nguyen                        Fiona                         Nguyen                        20150606FVancouver                   BCCA               Alex                          Admin                         20260101N                                  ',
        '61341-90000000009-6     TESTBN0000000012Jade                           Reed                          Jade                          Reed                          20191010FVancouver                   BCCA               Alex                          Admin                         20260101N                                  ',
        '61341-90000000018-7     TESTBN0000000012Sam                            Long                          Sam                           Long                          20160719MVancouver                   BCCA               Alex                          Admin                         20260101N                                  ',
        '6135V00.020260808TESTBN00000000100000005                         ',
      ].join('\n'),
      'utf8',
    )

    const result = generateCraResponseFromOutbound({
      outboundFilePath: outboundPath,
      inboundDir: path.join(tempDir, 'inbound'),
      outcome: 'mixed',
    })

    expect(result.outcome).toBe('mixed (1 accepted, 1 rejected, 1 recycled)')

    const parsed = new InboundResponseService().parseFile(result.responsePath)
    expect(parsed.details.map((detail) => detail.tranStatCd)).toEqual(['1', '2', '3'])
  })
})
