/** Calendar month in UTC (used for previous-month order/placement checks). */
export interface YearMonth {
  year: number
  month: number
}

export function getPreviousMonth(date: Date): YearMonth {
  const month = date.getUTCMonth() - 1
  if (month < 0) {
    return { year: date.getUTCFullYear() - 1, month: 11 }
  }
  return { year: date.getUTCFullYear(), month }
}

export function isInMonth(date: Date | null, month: YearMonth): boolean {
  if (!date) return false
  return date.getUTCFullYear() === month.year && date.getUTCMonth() === month.month
}
