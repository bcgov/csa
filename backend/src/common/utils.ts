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

// PST/PDT Date Helpers (using Luxon)
// ICM and CRA operate in Pacific time (America/Los_Angeles).
// These functions handle formatting UTC Dates as PST strings and parsing PST strings to UTC Dates.

const PST_ZONE = 'America/Los_Angeles'

// Format a Date as MM/DD/YYYY in PST/PDT.
// Used for ICM search spec cursor dates and date filters.
export function formatDatePst(date: Date): string {
  return DateTime.fromJSDate(date).setZone(PST_ZONE).toFormat('MM/dd/yyyy')
}

// Format a Date as YYYYMMDD in PST/PDT.
// Used for CRA file date fields.
export function formatDatePstCompact(date: Date): string {
  return DateTime.fromJSDate(date).setZone(PST_ZONE).toFormat('yyyyMMdd')
}

// Format a Date as MM/DD/YYYY HH:MM:SS in PST/PDT.
// Used for ICM sync-back payloads and datetime filters.
export function formatDateTimePst(date: Date): string {
  return DateTime.fromJSDate(date).setZone(PST_ZONE).toFormat('MM/dd/yyyy HH:mm:ss')
}

/**
 * Parse a date string (MM/DD/YYYY or MM/DD/YYYY HH:MM:SS) as PST/PDT
 * and return a UTC Date. Returns null for empty/null input.
 *
 * ICM sends dates in Pacific time. This function interprets the text
 * as PST and converts to a proper UTC Date.
 */
export function parseDateAsPst(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null

  const trimmed = dateStr.trim()
  const hasTime = trimmed.includes(':')
  const fmt = hasTime ? 'MM/dd/yyyy HH:mm:ss' : 'MM/dd/yyyy'

  const dt = DateTime.fromFormat(trimmed, fmt, { zone: PST_ZONE })
  if (!dt.isValid) return null

  return dt.toJSDate()
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

// String normalization for comparison
export function normalize(value: string | null | undefined): string | undefined {
  return value?.trim().toUpperCase()
}

// Eligibility helpers

// A child is eligible through the last day of their birth month at age 18.
export function getAgeCutoffDate(referenceDate: Date = new Date()): Date {
  const d = new Date(referenceDate)
  d.setDate(1)
  d.setFullYear(d.getFullYear() - 18)
  return d
}

export function isEligibleAge(dateOfBirth: Date, referenceDate: Date = new Date()): boolean {
  return dateOfBirth >= getAgeCutoffDate(referenceDate)
}
