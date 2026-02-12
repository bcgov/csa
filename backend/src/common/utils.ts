// Date Helpers

export function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${date.getFullYear()}`
}

export function formatDateTime(date: Date): string {
  return `${formatDate(date)} 00:00:00`
}

export function firstDayOfPreviousMonth(referenceDate: Date = new Date()): Date {
  const d = new Date(referenceDate)
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d
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
