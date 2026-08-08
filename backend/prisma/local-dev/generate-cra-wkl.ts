import * as fs from 'fs'
import * as path from 'path'
import 'dotenv/config'
import { CRA_DATA_HANDLING_CONSTANT } from '../../src/cra/cra.constant'
import { buildOutcomePlan, formatOutcomeSummary } from './outcome-plan'
import {
  findLatestOutboundFile,
  generateDin,
  padLeftZero,
  padRight,
  parseOutboundFileName,
  parseOutboundLines,
} from './generate-cra-response'

const { WEEKLY_FILE, TRAN_STAT_CODE } = CRA_DATA_HANDLING_CONSTANT
const { STATUS: WKL_STATUS } = WEEKLY_FILE

const BACKEND_ROOT = path.join(__dirname, '..', '..')
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..')
const DEFAULT_STORAGE = path.resolve(REPO_ROOT, '.local', 'storage')

export type WklOutcome = 'approved' | 'refused'

const WKL_OUTCOMES: WklOutcome[] = ['approved', 'refused']
const MIXED_WKL_PATTERN: WklOutcome[] = ['approved', 'refused']

export interface GenerateCraWklOptions {
  outboundFilePath: string
  inboundDir?: string
  outcome?: string
  craUserId?: string
  responseEnvFlag?: string
  rspFilePath?: string
}

export interface GenerateCraWklResult {
  outboundFile: string
  weeklyFile: string
  weeklyPath: string
  detailCount: number
  outcome: string
  outcomes: WklOutcome[]
}

interface OutboundDetailFields {
  referenceNum: string
  tranType: string
  childGivenName: string
  childInitial: string
  childSurName: string
  childBirthDate: string
  childSex: string
  childBirthCity: string
  childBirthProv: string
  childBirthCountry: string
  appStartDate: string
  cancelEndDate: string
  cancelReasonCode: string
}

function parseOutboundDetailLine(line: string): OutboundDetailFields {
  return {
    referenceNum: line.slice(4, 24).trim(),
    tranType: line.slice(39, 40).trim(),
    childGivenName: line.slice(40, 70),
    childInitial: line.slice(70, 71),
    childSurName: line.slice(71, 101),
    childBirthDate: line.slice(161, 169).trim(),
    childSex: line.slice(169, 170).trim(),
    childBirthCity: line.slice(170, 198),
    childBirthProv: line.slice(198, 200).trim(),
    childBirthCountry: line.slice(200, 202).trim(),
    appStartDate: line.slice(277, 285).trim(),
    cancelEndDate: line.slice(286, 294).trim(),
    cancelReasonCode: line.slice(294, 296).trim(),
  }
}

function statusForOutcome(outcome: WklOutcome): string {
  return outcome === 'refused' ? WKL_STATUS.ABANDONED : WKL_STATUS.COMPLETED
}

function transactionTypeForOutbound(tranType: string): 'A' | 'C' {
  return tranType === '1' ? 'C' : 'A'
}

function readDinsFromRspFile(rspFilePath: string, detailCount: number): string[] | null {
  if (!fs.existsSync(rspFilePath)) {
    return null
  }

  const lines = fs
    .readFileSync(rspFilePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
  if (lines.length < 3) {
    return null
  }

  const detailLines = lines.slice(1, -1)
  if (detailLines.length !== detailCount) {
    return null
  }

  return detailLines.map((line) => {
    const accepted = line.slice(6, 7) === TRAN_STAT_CODE.TRAN_ACCEPTED
    const din = line.slice(318, 327).trim()
    return accepted && din ? din : ''
  })
}

function resolveRspFilePath(
  inboundDir: string,
  craUserId: string,
  sequence: string,
  responseEnvFlag: string,
  rspFilePath?: string,
): string | null {
  if (rspFilePath) {
    const resolved = path.resolve(rspFilePath)
    return fs.existsSync(resolved) ? resolved : null
  }

  const defaultName = `${craUserId}.${responseEnvFlag}RSP${sequence}`
  const defaultPath = path.join(inboundDir, defaultName)
  return fs.existsSync(defaultPath) ? defaultPath : null
}

function buildWeeklyHeader(processDate: string): string {
  return (
    padRight(WEEKLY_FILE.HEADER_TRAN_CODE, 4) +
    padRight('00', 2) +
    padRight('', 8) +
    padRight(processDate, 8) +
    padRight('', 219)
  )
}

function buildWeeklyTrailer(detailCount: number): string {
  return (
    padRight(WEEKLY_FILE.TRAILER_TRAN_CODE, 4) +
    padRight('00', 2) +
    padRight('', 9) +
    padLeftZero(detailCount + 2, 9) +
    padRight('', 217)
  )
}

function buildWeeklyDetailLine(
  detail: OutboundDetailFields,
  childDin: string,
  outcome: WklOutcome,
  completionDate: string,
): string {
  const transactionType = transactionTypeForOutbound(detail.tranType)
  const isCancellation = transactionType === 'C'

  let line = ''.padEnd(241, ' ')
  const set = (start: number, end: number, value: string) => {
    line = line.slice(0, start) + padRight(value, end - start) + line.slice(end)
  }

  set(0, 4, WEEKLY_FILE.DETAILS_TRAN_CODE)
  set(4, 6, '04')
  set(7, 8, transactionType)
  set(14, 15, WEEKLY_FILE.RECEIVE_MODE.ELECTQRONIC)
  set(21, 30, childDin)
  set(31, 61, detail.childGivenName)
  set(62, 63, detail.childInitial)
  set(71, 101, detail.childSurName)
  set(102, 103, detail.childSex)
  set(107, 115, detail.childBirthDate)
  set(118, 146, detail.childBirthCity)
  set(147, 149, detail.childBirthProv)
  set(165, 167, detail.childBirthCountry)
  set(182, 190, isCancellation ? '' : detail.appStartDate)
  set(194, 202, isCancellation ? detail.cancelEndDate : '')
  set(204, 206, isCancellation ? detail.cancelReasonCode : '')
  set(211, 222, statusForOutcome(outcome))
  set(223, 231, completionDate)

  return line
}

export function generateCraWklFromOutbound(options: GenerateCraWklOptions): GenerateCraWklResult {
  const outboundFilePath = path.resolve(options.outboundFilePath)
  if (!fs.existsSync(outboundFilePath)) {
    throw new Error(`Outbound CRA file not found: ${outboundFilePath}`)
  }

  const storageRoot = process.env.FILE_STORAGE_PATH
    ? path.resolve(process.env.FILE_STORAGE_PATH)
    : DEFAULT_STORAGE
  const inboundDir = options.inboundDir ?? path.join(storageRoot, 'cra-mock', 'inbound')
  const responseEnvFlag =
    options.responseEnvFlag ?? (process.env.CRA_ENVIRONMENT === 'production' ? 'P' : 'A')

  const outboundContent = fs.readFileSync(outboundFilePath, 'utf8')
  const { detailLines, processDate } = parseOutboundLines(outboundContent)
  const outboundFileName = path.basename(outboundFilePath)
  const parsedName = parseOutboundFileName(outboundFileName)
  const craUserId = options.craUserId ?? parsedName.craUserId
  const weeklyFileName = `${craUserId}.${responseEnvFlag}WKL${parsedName.sequence}`

  const rspFilePath = resolveRspFilePath(
    inboundDir,
    craUserId,
    parsedName.sequence,
    responseEnvFlag,
    options.rspFilePath,
  )
  const rspDins = rspFilePath ? readDinsFromRspFile(rspFilePath, detailLines.length) : null

  const outcomePlan = buildOutcomePlan(
    detailLines.length,
    options.outcome,
    'approved',
    WKL_OUTCOMES,
    MIXED_WKL_PATTERN,
  )

  const weeklyLines = [
    buildWeeklyHeader(processDate),
    ...detailLines.map((detailLine, index) => {
      const detail = parseOutboundDetailLine(detailLine)
      const rspDin = rspDins?.[index]?.trim()
      const childDin = rspDin || generateDin(detail.referenceNum, index)
      return buildWeeklyDetailLine(detail, childDin, outcomePlan.outcomes[index]!, processDate)
    }),
    buildWeeklyTrailer(detailLines.length),
  ]

  fs.mkdirSync(inboundDir, { recursive: true })
  const weeklyPath = path.join(inboundDir, weeklyFileName)
  fs.writeFileSync(weeklyPath, `${weeklyLines.join('\n')}\n`, 'utf8')

  return {
    outboundFile: outboundFileName,
    weeklyFile: weeklyFileName,
    weeklyPath,
    detailCount: detailLines.length,
    outcome: formatOutcomeSummary(outcomePlan),
    outcomes: outcomePlan.outcomes,
  }
}

function main(): void {
  const storageRoot = process.env.FILE_STORAGE_PATH
    ? path.resolve(process.env.FILE_STORAGE_PATH)
    : DEFAULT_STORAGE
  const outboundArg = process.argv[2]
  const outcomeArg = process.argv[3] ?? 'approved'
  const outboundFilePath =
    outboundArg ?? findLatestOutboundFile(path.join(storageRoot, 'cra', 'outbound'))

  const result = generateCraWklFromOutbound({
    outboundFilePath,
    outcome: outcomeArg,
  })

  console.log(`Generated CRA weekly file from ${result.outboundFile}`)
  console.log(`  details: ${result.detailCount}`)
  console.log(`  outcome: ${result.outcome}`)
  console.log(`  file:    ${result.weeklyPath}`)
  console.log('Next: make poll-cra-response')
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}
