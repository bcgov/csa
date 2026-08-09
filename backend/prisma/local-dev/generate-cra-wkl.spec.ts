import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { InboundWeeklyResponseService } from '../../src/cra/inbound/inbound-weekly-response.service'
import { generateCraResponseFromOutbound } from './generate-cra-response'
import { generateCraWklFromOutbound } from './generate-cra-wkl'

describe('generateCraWklFromOutbound', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('generates a parseable WKL file from an outbound request file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cra-wkl-'))
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
    const result = generateCraWklFromOutbound({
      outboundFilePath: outboundPath,
      inboundDir,
      outcome: 'approved',
    })

    expect(result.weeklyFile).toBe('TESTUSERID1.AWKL0001')
    expect(result.detailCount).toBe(1)

    const parsed = new InboundWeeklyResponseService().parseWeeklyResponseFile(result.weeklyPath)
    expect(parsed.details).toHaveLength(1)
    expect(parsed.details[0].receiveMode).toBe('E')
    expect(parsed.details[0].transactionType).toBe('A')
    expect(parsed.details[0].childGivenName.trim()).toBe('Fiona')
    expect(parsed.details[0].childSurName.trim()).toBe('Nguyen')
    expect(parsed.details[0].status.trim()).toBe('completed')
    expect(parsed.details[0].childDin.trim()).not.toBe('')
  })

  it('reuses DINs from a matching RSP file when present', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cra-wkl-rsp-'))
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
    generateCraResponseFromOutbound({
      outboundFilePath: outboundPath,
      inboundDir,
      outcome: 'accepted',
    })

    const rspPath = path.join(inboundDir, 'TESTUSERID1.ARSP0001')
    const rspContent = fs.readFileSync(rspPath, 'utf8')
    const rspDin = rspContent.split('\n')[1].slice(318, 327).trim()

    const result = generateCraWklFromOutbound({
      outboundFilePath: outboundPath,
      inboundDir,
      outcome: 'approved',
    })

    const parsed = new InboundWeeklyResponseService().parseWeeklyResponseFile(result.weeklyPath)
    expect(parsed.details[0].childDin.trim()).toBe(rspDin)
  })

  it('supports mixed per-record outcomes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cra-wkl-mixed-'))
    tempDirs.push(tempDir)

    const outboundPath = path.join(tempDir, 'II.ACSAIN.TESTUSERID1.AAPL0001')
    fs.writeFileSync(
      outboundPath,
      [
        '6133V00.020260808TESTBN00000000100000000                         ',
        '61341-90000000005-5     TESTBN0000000012Fiona                          Nguyen                        Fiona                         Nguyen                        20150606FVancouver                   BCCA               Alex                          Admin                         20260101N                                  ',
        '61341-90000000009-6     TESTBN0000000012Jade                           Reed                          Jade                          Reed                          20191010FVancouver                   BCCA               Alex                          Admin                         20260101N                                  ',
        '6135V00.020260808TESTBN00000000100000004                         ',
      ].join('\n'),
      'utf8',
    )

    const result = generateCraWklFromOutbound({
      outboundFilePath: outboundPath,
      inboundDir: path.join(tempDir, 'inbound'),
      outcome: 'mixed',
    })

    expect(result.outcome).toBe('mixed (1 approved, 1 refused)')

    const parsed = new InboundWeeklyResponseService().parseWeeklyResponseFile(result.weeklyPath)
    expect(parsed.details.map((detail) => detail.status.trim())).toEqual(['completed', 'abandoned'])
  })
})
