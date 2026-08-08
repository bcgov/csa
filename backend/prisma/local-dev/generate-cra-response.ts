import * as fs from 'fs'
import * as path from 'path'
import 'dotenv/config'
import { CRA_DATA_HANDLING_CONSTANT } from '../../src/cra/cra.constant'
import { buildOutcomePlan, formatOutcomeSummary } from './outcome-plan'

const { REQUEST_FILE, RESPONSE_FILE, FILE_STAT_CODE, TRAN_STAT_CODE } = CRA_DATA_HANDLING_CONSTANT

const BACKEND_ROOT = path.join(__dirname, '..', '..')
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..')
const DEFAULT_STORAGE = path.resolve(REPO_ROOT, '.local', 'storage')

export type ResponseOutcome = 'accepted' | 'rejected' | 'recycled'

const RESPONSE_OUTCOMES: ResponseOutcome[] = ['accepted', 'rejected', 'recycled']
const MIXED_RSP_PATTERN: ResponseOutcome[] = ['accepted', 'rejected', 'recycled']

export interface GenerateCraResponseOptions {
  outboundFilePath: string
  inboundDir?: string
  outcome?: string
  craUserId?: string
  responseEnvFlag?: string
}

export interface GenerateCraResponseResult {
  outboundFile: string
  responseFile: string
  responsePath: string
  detailCount: number
  outcome: string
  outcomes: ResponseOutcome[]
}

export function padRight(value: string | number, length: number): string {
  return String(value ?? '')
    .padEnd(length, ' ')
    .slice(0, length)
}

export function padLeftZero(value: number, length: number): string {
  return String(value).padStart(length, '0').slice(0, length)
}

export function parseOutboundFileName(fileName: string): { craUserId: string; sequence: string } {
  const parts = fileName.split('.')
  if (parts.length < 4) {
    throw new Error(`Unexpected outbound CRA file name: ${fileName}`)
  }

  const craUserId = parts[2]
  const typeAndSequence = parts[3]
  const sequence = typeAndSequence.slice(-4)

  if (!/^\d{4}$/.test(sequence)) {
    throw new Error(`Could not parse sequence number from outbound file name: ${fileName}`)
  }

  return { craUserId, sequence }
}

export function parseOutboundLines(content: string): {
  headerLine: string
  detailLines: string[]
  trailerLine: string
  processDate: string
  businessNum: string
} {
  const lines = content.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length < 3) {
    throw new Error('Outbound CRA file must contain header, at least one detail, and trailer')
  }

  const headerLine = lines[0]
  const trailerLine = lines[lines.length - 1]
  const detailLines = lines.slice(1, -1)

  const headerCode = headerLine.slice(0, 4)
  const trailerCode = trailerLine.slice(0, 4)
  if (headerCode !== String(REQUEST_FILE.HEADER_TRAN_CODE)) {
    throw new Error(`Expected outbound header ${REQUEST_FILE.HEADER_TRAN_CODE}, got ${headerCode}`)
  }
  if (trailerCode !== String(REQUEST_FILE.TRAILER_TRAN_CODE)) {
    throw new Error(
      `Expected outbound trailer ${REQUEST_FILE.TRAILER_TRAN_CODE}, got ${trailerCode}`,
    )
  }

  for (const detailLine of detailLines) {
    if (detailLine.slice(0, 4) !== String(REQUEST_FILE.DETAIL_TRAN_CODE)) {
      throw new Error(
        `Expected outbound detail ${REQUEST_FILE.DETAIL_TRAN_CODE}, got ${detailLine.slice(0, 4)}`,
      )
    }
  }

  return {
    headerLine,
    detailLines,
    trailerLine,
    processDate: headerLine.slice(9, 17).trim(),
    businessNum: headerLine.slice(17, 32).trim(),
  }
}

export function generateDin(referenceNum: string, index: number): string {
  const digits = referenceNum.replace(/\D/g, '')
  const seed = `${digits}${index}`.padStart(9, '0')
  return seed.slice(-9)
}

function statusCodesForOutcome(outcome: ResponseOutcome): {
  fileStatCd: string
  tranStatCd: string
  rejectCodes: string[]
} {
  if (outcome === 'accepted') {
    return {
      fileStatCd: FILE_STAT_CODE.FILE_OK,
      tranStatCd: TRAN_STAT_CODE.TRAN_ACCEPTED,
      rejectCodes: ['000', '000', '000', '000', '000'],
    }
  }

  if (outcome === 'recycled') {
    return {
      fileStatCd: FILE_STAT_CODE.FILE_OK,
      tranStatCd: TRAN_STAT_CODE.TRAN_RECYCLED,
      rejectCodes: ['998', '000', '000', '000', '000'],
    }
  }

  return {
    fileStatCd: FILE_STAT_CODE.FILE_OK,
    tranStatCd: TRAN_STAT_CODE.TRAN_REJECTED,
    rejectCodes: ['007', '000', '000', '000', '000'],
  }
}

function buildResponseDetailLine(
  outboundDetailLine: string,
  index: number,
  outcome: ResponseOutcome,
): string {
  const { fileStatCd, tranStatCd, rejectCodes } = statusCodesForOutcome(outcome)
  const outboundBody = outboundDetailLine.slice(4)
  const referenceNum = outboundBody.slice(0, 20).trim()
  const tranType = outboundBody.slice(35, 36).trim()

  let line =
    padRight(RESPONSE_FILE.DETAILS_TRAN_CODE, 4) +
    padRight(fileStatCd, 2) +
    padRight(tranStatCd, 1) +
    rejectCodes.map((code) => padRight(code, 3)).join('') +
    padRight(REQUEST_FILE.DETAIL_TRAN_CODE, 4) +
    outboundBody

  if (tranType === '2' && outcome === 'accepted') {
    const din = generateDin(referenceNum, index)
    line = line.slice(0, 318) + padRight(din, 9) + line.slice(327)
  }

  return line
}

function buildResponseHeader(
  processDate: string,
  businessNum: string,
  detailCount: number,
): string {
  return (
    padRight(RESPONSE_FILE.HEADER_TRAN_CODE, 4) +
    padRight(REQUEST_FILE.VERSION_NUM, 5) +
    padRight(processDate, 8) +
    padRight(businessNum, 15) +
    padLeftZero(detailCount, 8)
  )
}

function buildResponseTrailer(
  processDate: string,
  businessNum: string,
  detailCount: number,
): string {
  return (
    padRight(RESPONSE_FILE.TRAILER_TRAN_CODE, 4) +
    padRight(REQUEST_FILE.VERSION_NUM, 5) +
    padRight(processDate, 8) +
    padRight(businessNum, 15) +
    padLeftZero(detailCount, 8)
  )
}

export function generateCraResponseFromOutbound(
  options: GenerateCraResponseOptions,
): GenerateCraResponseResult {
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
  const { detailLines, processDate, businessNum } = parseOutboundLines(outboundContent)
  const outboundFileName = path.basename(outboundFilePath)
  const parsedName = parseOutboundFileName(outboundFileName)
  const craUserId = options.craUserId ?? parsedName.craUserId
  const responseFileName = `${craUserId}.${responseEnvFlag}RSP${parsedName.sequence}`

  const outcomePlan = buildOutcomePlan(
    detailLines.length,
    options.outcome,
    'accepted',
    RESPONSE_OUTCOMES,
    MIXED_RSP_PATTERN,
  )

  const responseLines = [
    buildResponseHeader(processDate, businessNum, detailLines.length),
    ...detailLines.map((detailLine, index) =>
      buildResponseDetailLine(detailLine, index, outcomePlan.outcomes[index]!),
    ),
    buildResponseTrailer(processDate, businessNum, detailLines.length),
  ]

  fs.mkdirSync(inboundDir, { recursive: true })
  const responsePath = path.join(inboundDir, responseFileName)
  fs.writeFileSync(responsePath, `${responseLines.join('\n')}\n`, 'utf8')

  return {
    outboundFile: outboundFileName,
    responseFile: responseFileName,
    responsePath,
    detailCount: detailLines.length,
    outcome: formatOutcomeSummary(outcomePlan),
    outcomes: outcomePlan.outcomes,
  }
}

export function findLatestOutboundFile(outboundDir: string): string {
  if (!fs.existsSync(outboundDir)) {
    throw new Error(`Outbound CRA directory not found: ${outboundDir}`)
  }

  const files = fs
    .readdirSync(outboundDir)
    .filter((name) => fs.statSync(path.join(outboundDir, name)).isFile())
    .sort(
      (a, b) =>
        fs.statSync(path.join(outboundDir, b)).mtimeMs -
        fs.statSync(path.join(outboundDir, a)).mtimeMs,
    )

  if (files.length === 0) {
    throw new Error(`No outbound CRA files found in ${outboundDir}`)
  }

  return path.join(outboundDir, files[0])
}

function main(): void {
  const storageRoot = process.env.FILE_STORAGE_PATH
    ? path.resolve(process.env.FILE_STORAGE_PATH)
    : DEFAULT_STORAGE
  const outboundArg = process.argv[2]
  const outcomeArg = process.argv[3] ?? 'accepted'
  const outboundFilePath =
    outboundArg ?? findLatestOutboundFile(path.join(storageRoot, 'cra', 'outbound'))

  const result = generateCraResponseFromOutbound({
    outboundFilePath,
    outcome: outcomeArg,
  })

  console.log(`Generated CRA response from ${result.outboundFile}`)
  console.log(`  details: ${result.detailCount}`)
  console.log(`  outcome: ${result.outcome}`)
  console.log(`  file:    ${result.responsePath}`)
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
