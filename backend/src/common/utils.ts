import { DateTime } from 'luxon'
import {
  BATCH_DETAIL_STATUS_LABELS,
  BATCH_STATUS_LABELS,
  CSA_STATUS_LABELS,
} from './state-machine/constants'

export function daysAgoPacific(days: number, referenceDate: Date = new Date()): Date {
  const ref = DateTime.fromJSDate(referenceDate).setZone(PACIFIC_ZONE)
  return ref.minus({ days }).toJSDate()
}

export function firstDayOfPreviousMonthPacific(referenceDate: Date = new Date()): Date {
  const ref = DateTime.fromJSDate(referenceDate).setZone(PACIFIC_ZONE)
  return ref.minus({ months: 1 }).startOf('month').toJSDate()
}

const PACIFIC_ZONE = 'America/Vancouver'

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SPACE_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
// Date-only strings ('2026-01-09') are interpreted as UTC midnight by new Date(),
// which shifts to the previous day in Pacific time. Parse as Pacific midnight instead.
export function parseISODatePacific(value: string): Date {
  if (DATE_ONLY_PATTERN.test(value)) {
    return DateTime.fromISO(value, { zone: PACIFIC_ZONE }).toJSDate()
  }
  if (SPACE_DATETIME_PATTERN.test(value)) {
    const dt = DateTime.fromFormat(value.trim(), 'yyyy-MM-dd HH:mm:ss', { zone: PACIFIC_ZONE })
    if (dt.isValid) return new Date(dt.toISODate()!)
  }
  return new Date(value)
}

export function formatDatePacific(date: Date): string {
  return DateTime.fromJSDate(date).setZone(PACIFIC_ZONE).toFormat('MM/dd/yyyy')
}

export function formatDatePacificCompact(date: Date): string {
  return DateTime.fromJSDate(date).setZone(PACIFIC_ZONE).toFormat('yyyyMMdd')
}

export function formatDateTimePacific(date: Date): string {
  return DateTime.fromJSDate(date).setZone(PACIFIC_ZONE).toFormat('MM/dd/yyyy HH:mm:ss')
}

export function parseDateAsPacific(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null

  const trimmed = dateStr.trim()
  const hasTime = trimmed.includes(':')
  const fmt = hasTime ? 'MM/dd/yyyy HH:mm:ss' : 'MM/dd/yyyy'

  const dt = DateTime.fromFormat(trimmed, fmt, { zone: PACIFIC_ZONE })
  if (!dt.isValid) return null

  return dt.toJSDate()
}

export function formatIcmTimestamp(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === '') return null
  const trimmed = raw.trim()
  const hasTime = trimmed.includes(':')
  const fmt = hasTime ? 'MM/dd/yyyy HH:mm:ss' : 'MM/dd/yyyy'
  const dt = DateTime.fromFormat(trimmed, fmt)
  return dt.isValid ? dt.toISO({ includeOffset: false, suppressMilliseconds: true }) : null
}

export function formatCalendarDate(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${mm}/${dd}/${date.getUTCFullYear()}`
}

export function parseCalendarDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr.trim() === '') return null

  const trimmed = dateStr.trim()
  const dt = DateTime.fromFormat(trimmed, 'MM/dd/yyyy')
  if (!dt.isValid) return null

  return dt.toISODate()!
}

const DATE_ONLY_FIELDS = new Set([
  'dateOfBirth',
  'effectiveDate',
  'expiryDate',
  'orderEffectiveStartDate',
  'orderEffectiveEndDate',
  'careEndDate',
  'batchDate',
  'actualStartDate',
  'actualEndDate',
  'agreementStartDate',
  'agreementEndDate',
  'terminationDate',
])

export function enrichLabels<T extends Record<string, any>>(record: T): T {
  const labels: Record<string, string> = {}

  if ('csaStatus' in record && record.csaStatus) {
    labels.csaStatusLabel = CSA_STATUS_LABELS[record.csaStatus] ?? record.csaStatus
  } else if ('csaStatus' in record) {
    labels.csaStatusLabel = ''
  }

  if ('status' in record && record.status) {
    if ('transactionType' in record) {
      labels.statusLabel = BATCH_DETAIL_STATUS_LABELS[record.status] ?? record.status
    } else {
      labels.statusLabel = BATCH_STATUS_LABELS[record.status] ?? record.status
    }
  } else if ('status' in record) {
    labels.statusLabel = ''
  }

  const flags: Record<string, boolean> = {}

  if ('dateOfBirth' in record && record.dateOfBirth) {
    flags.isOver18 = !isEligibleAge(record.dateOfBirth)
  }

  const dates: Record<string, string> = {}
  for (const field of DATE_ONLY_FIELDS) {
    if (field in record && record[field] instanceof Date) {
      dates[field] = record[field].toISOString().split('T')[0]
    }
  }

  return { ...record, ...labels, ...flags, ...dates }
}

export function normalize(value: string | null | undefined): string | undefined {
  return value?.trim().toUpperCase()
}

export function parseWklDate(dateStr: string): Date | undefined {
  if (!dateStr || dateStr.trim().length !== 8) return undefined
  const y = dateStr.substring(0, 4)
  const m = dateStr.substring(4, 6)
  const d = dateStr.substring(6, 8)
  const dt = DateTime.fromFormat(`${y}-${m}-${d}`, 'yyyy-MM-dd', { zone: PACIFIC_ZONE })
  return dt.isValid ? dt.toJSDate() : undefined
}

export function parseEffectiveDate(date: Date | string | null): string {
  if (!date) return ''
  const dateValue = typeof date === 'string' ? new Date(date) : date
  const year = dateValue.getUTCFullYear()
  const month = String(dateValue.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dateValue.getUTCDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

export function pacificToday(): Date {
  const isoDate = DateTime.now().setZone(PACIFIC_ZONE).toISODate()!
  return DateTime.fromISO(isoDate, { zone: PACIFIC_ZONE }).toJSDate()
}

/** Pacific calendar date for when CSA processed a WKL file (maps to transfer_file.delivered_at). */
export function csaProcessingBatchDate(processedAt: Date | null | undefined): Date {
  const isoDate = DateTime.fromJSDate(processedAt ?? new Date())
    .setZone(PACIFIC_ZONE)
    .toISODate()!
  return DateTime.fromISO(isoDate, { zone: PACIFIC_ZONE }).toJSDate()
}

export function pacificTodayISO(): string {
  return DateTime.now().setZone(PACIFIC_ZONE).toISODate()!
}

export function pacificNowISO(): string {
  return DateTime.now().setZone(PACIFIC_ZONE).toFormat('yyyy-MM-dd HH:mm:ss')
}

export function appendSystemComment(
  newMessage: string | null,
  existingComments: string | null,
): string | null {
  if (!newMessage) return existingComments
  const dated = `[${pacificNowISO()}] ${newMessage}`
  return existingComments ? `${dated}\n${existingComments}` : dated
}

// A child is eligible through the last day of their birth month at age 18.
// Returns Pacific midnight so formatDatePacific round-trips correctly.
export function getAgeCutoffDate(referenceDate: Date = pacificToday()): Date {
  const year = referenceDate.getUTCFullYear() - 18
  const month = referenceDate.getUTCMonth() + 1
  return DateTime.fromObject({ year, month, day: 1 }, { zone: PACIFIC_ZONE }).toJSDate()
}

export function isEligibleAge(dateOfBirth: Date, referenceDate: Date = pacificToday()): boolean {
  const cutoff = getAgeCutoffDate(referenceDate)
  return dateOfBirth.toISOString().slice(0, 10) >= cutoff.toISOString().slice(0, 10)
}

export type PrismaSortDirection = 'asc' | 'desc'
export type PrismaOrderByItem = Record<string, PrismaSortDirection>

/**
 * Ensures paginated Prisma queries use deterministic ordering so rows do not
 * shift between pages when sort keys tie or no sort is provided.
 */
export function buildStableOrderBy(
  orderBy?: PrismaOrderByItem | PrismaOrderByItem[],
  options?: { tieBreakerField?: string; tieBreakerDirection?: PrismaSortDirection },
): PrismaOrderByItem[] {
  const tieBreakerField = options?.tieBreakerField ?? 'id'
  const tieBreakerDirection = options?.tieBreakerDirection ?? 'asc'

  if (!orderBy || (Array.isArray(orderBy) && orderBy.length === 0)) {
    return [{ [tieBreakerField]: tieBreakerDirection }]
  }

  const items = Array.isArray(orderBy) ? [...orderBy] : [orderBy]
  const hasTieBreaker = items.some((item) => Object.keys(item)[0] === tieBreakerField)

  if (hasTieBreaker) {
    return items
  }

  return [...items, { [tieBreakerField]: tieBreakerDirection }]
}

export interface S3ConnectionParams {
  endPoint: string
  port: number | undefined
  useSSL: boolean
  accessKey: string
  secretKey: string
}

// Parses s3URI manually because `new URL()` breaks when credentials contain `/` or `@`
export function parseS3Uri(uri: string): S3ConnectionParams {
  const schemeMatch = uri.match(/^(https?):\/\/(.+)$/)
  if (!schemeMatch) throw new Error('Invalid s3URI: missing http(s):// scheme')

  const [, scheme, rest] = schemeMatch

  const lastAt = rest.lastIndexOf('@')
  if (lastAt === -1) throw new Error('Invalid s3URI: expected user:pass@host')

  const credentials = rest.substring(0, lastAt)
  const hostPart = rest.substring(lastAt + 1).split('/')[0]

  const firstColon = credentials.indexOf(':')
  if (firstColon === -1) throw new Error('Invalid s3URI: expected user:pass@host')

  const accessKey = credentials.substring(0, firstColon)
  const secretKey = credentials.substring(firstColon + 1)

  const [host, portStr] = hostPart.split(':')

  return {
    endPoint: host,
    port: portStr ? parseInt(portStr, 10) : undefined,
    useSSL: scheme === 'https',
    accessKey,
    secretKey,
  }
}
