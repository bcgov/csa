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
