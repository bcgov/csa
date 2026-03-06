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

export function pacificToday(): Date {
  const isoDate = DateTime.now().setZone(PACIFIC_ZONE).toISODate()!
  return new Date(isoDate)
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
export function getAgeCutoffDate(referenceDate: Date = pacificToday()): Date {
  return new Date(Date.UTC(referenceDate.getUTCFullYear() - 18, referenceDate.getUTCMonth(), 1))
}

export function isEligibleAge(dateOfBirth: Date, referenceDate: Date = pacificToday()): boolean {
  return dateOfBirth >= getAgeCutoffDate(referenceDate)
}
