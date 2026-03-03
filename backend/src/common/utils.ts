import { DateTime } from 'luxon'
import { CSA_STATUS_LABELS } from './state-machine/constants'

// Date Helpers

export function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${date.getFullYear()}`
}

export function formatDateTime(date: Date): string {
  return `${formatDate(date)} 00:00:00`
}

export function daysAgo(days: number, referenceDate: Date = new Date()): Date {
  const d = new Date(referenceDate)
  d.setDate(d.getDate() - days)
  return d
}

export function firstDayOfPreviousMonth(referenceDate: Date = new Date()): Date {
  const d = new Date(referenceDate)
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d
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

export function enrichLabels<T extends Record<string, any>>(record: T): T {
  const labels: Record<string, string> = {}

  if ('csaStatus' in record && record.csaStatus) {
    labels.csaStatusLabel = CSA_STATUS_LABELS[record.csaStatus] ?? record.csaStatus
  } else if ('csaStatus' in record) {
    labels.csaStatusLabel = ''
  }

  const flags: Record<string, boolean> = {}

  if ('dateOfBirth' in record && record.dateOfBirth) {
    flags.isOver18 = !isEligibleAge(record.dateOfBirth)
  }

  return { ...record, ...labels, ...flags }
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

// A child is eligible through the last day of their birth month at age 18.
export function getAgeCutoffDate(referenceDate: Date = pacificToday()): Date {
  const d = new Date(referenceDate)
  d.setDate(1)
  d.setFullYear(d.getFullYear() - 18)
  return d
}

export function isEligibleAge(dateOfBirth: Date, referenceDate: Date = pacificToday()): boolean {
  return dateOfBirth >= getAgeCutoffDate(referenceDate)
}
