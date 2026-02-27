import { describe, expect, it } from 'vitest'
import {
  firstDayOfPreviousMonth,
  formatDate,
  formatDatePst,
  formatDatePstCompact,
  formatDateTime,
  formatDateTimePst,
  getAgeCutoffDate,
  isEligibleAge,
  parseDateAsPst,
} from './utils'

describe('formatDate', () => {
  it('should format as MM/DD/YYYY', () => {
    expect(formatDate(new Date(2026, 1, 10))).toBe('02/10/2026')
  })

  it('should zero-pad month and day', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('01/05/2026')
  })
})

describe('formatDateTime', () => {
  it('should append 00:00:00', () => {
    expect(formatDateTime(new Date(2026, 1, 10))).toBe('02/10/2026 00:00:00')
  })
})

describe('firstDayOfPreviousMonth', () => {
  it('should return first day of previous month', () => {
    const result = firstDayOfPreviousMonth(new Date(2026, 1, 15))
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(0) // January
    expect(result.getDate()).toBe(1)
  })

  it('should handle January (rolls back to December of previous year)', () => {
    const result = firstDayOfPreviousMonth(new Date(2026, 0, 10))
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(11) // December
    expect(result.getDate()).toBe(1)
  })

  it('should handle March 31 correctly (the setMonth rollover bug)', () => {
    const result = firstDayOfPreviousMonth(new Date(2026, 2, 31))
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(1) // February
    expect(result.getDate()).toBe(1)
  })

  it('should handle May 31 correctly (April has 30 days)', () => {
    const result = firstDayOfPreviousMonth(new Date(2026, 4, 31))
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(3) // April
    expect(result.getDate()).toBe(1)
  })
})

describe('formatDatePst', () => {
  it('should format UTC noon as same-day PST', () => {
    expect(formatDatePst(new Date('2026-01-15T12:00:00Z'))).toBe('01/15/2026')
  })

  it('should format UTC midnight as previous day in PST (winter)', () => {
    expect(formatDatePst(new Date('2026-01-15T00:00:00Z'))).toBe('01/14/2026')
  })

  it('should format UTC midnight as previous day in PDT (summer)', () => {
    expect(formatDatePst(new Date('2026-07-15T00:00:00Z'))).toBe('07/14/2026')
  })

  it('should handle UTC 08:00 as same day midnight PST (winter)', () => {
    expect(formatDatePst(new Date('2026-01-15T08:00:00Z'))).toBe('01/15/2026')
  })

  it('should handle UTC 07:00 as same day midnight PDT (summer)', () => {
    expect(formatDatePst(new Date('2026-07-15T07:00:00Z'))).toBe('07/15/2026')
  })

  it('should zero-pad month and day', () => {
    expect(formatDatePst(new Date('2026-03-05T20:00:00Z'))).toBe('03/05/2026')
  })
})

describe('formatDatePstCompact', () => {
  it('should format as YYYYMMDD in PST (winter)', () => {
    expect(formatDatePstCompact(new Date('2026-01-15T12:00:00Z'))).toBe('20260115')
  })

  it('should format UTC midnight as previous day in PST', () => {
    expect(formatDatePstCompact(new Date('2026-01-15T00:00:00Z'))).toBe('20260114')
  })

  it('should format as YYYYMMDD in PDT (summer)', () => {
    expect(formatDatePstCompact(new Date('2026-07-15T12:00:00Z'))).toBe('20260715')
  })

  it('should zero-pad month and day', () => {
    expect(formatDatePstCompact(new Date('2026-03-05T20:00:00Z'))).toBe('20260305')
  })
})

describe('formatDateTimePst', () => {
  it('should format with time in PST (winter)', () => {
    expect(formatDateTimePst(new Date('2026-01-15T18:30:45Z'))).toBe('01/15/2026 10:30:45')
  })

  it('should format with time in PDT (summer)', () => {
    expect(formatDateTimePst(new Date('2026-07-15T17:30:00Z'))).toBe('07/15/2026 10:30:00')
  })

  it('should handle midnight PST', () => {
    expect(formatDateTimePst(new Date('2026-01-15T08:00:00Z'))).toBe('01/15/2026 00:00:00')
  })

  it('should handle 23:59:59 PST', () => {
    expect(formatDateTimePst(new Date('2026-01-16T07:59:59Z'))).toBe('01/15/2026 23:59:59')
  })

  it('should zero-pad hours, minutes, seconds', () => {
    expect(formatDateTimePst(new Date('2026-01-15T08:05:03Z'))).toBe('01/15/2026 00:05:03')
  })
})

describe('parseDateAsPst', () => {
  it('should parse MM/DD/YYYY HH:MM:SS as PST (winter)', () => {
    const result = parseDateAsPst('01/13/2026 10:51:03')
    expect(result!.toISOString()).toBe('2026-01-13T18:51:03.000Z')
  })

  it('should parse MM/DD/YYYY HH:MM:SS as PDT (summer)', () => {
    const result = parseDateAsPst('07/15/2026 10:00:00')
    expect(result!.toISOString()).toBe('2026-07-15T17:00:00.000Z')
  })

  it('should parse date-only as PST midnight (winter)', () => {
    const result = parseDateAsPst('01/13/2026')
    expect(result!.toISOString()).toBe('2026-01-13T08:00:00.000Z')
  })

  it('should parse date-only as PDT midnight (summer)', () => {
    const result = parseDateAsPst('07/15/2026')
    expect(result!.toISOString()).toBe('2026-07-15T07:00:00.000Z')
  })

  it('should handle midnight timestamp', () => {
    const result = parseDateAsPst('01/13/2026 00:00:00')
    expect(result!.toISOString()).toBe('2026-01-13T08:00:00.000Z')
  })

  it('should handle 23:59:59 PST', () => {
    const result = parseDateAsPst('01/13/2026 23:59:59')
    expect(result!.toISOString()).toBe('2026-01-14T07:59:59.000Z')
  })

  it('should return null for empty string', () => {
    expect(parseDateAsPst('')).toBeNull()
  })

  it('should return null for null', () => {
    expect(parseDateAsPst(null)).toBeNull()
  })

  it('should return null for undefined', () => {
    expect(parseDateAsPst(undefined)).toBeNull()
  })

  it('should return null for whitespace-only', () => {
    expect(parseDateAsPst('   ')).toBeNull()
  })

  it('should handle DST spring-forward boundary (March)', () => {
    const beforeSpring = parseDateAsPst('03/08/2026 01:30:00')
    expect(beforeSpring!.toISOString()).toBe('2026-03-08T09:30:00.000Z')

    const afterSpring = parseDateAsPst('03/08/2026 03:30:00')
    expect(afterSpring!.toISOString()).toBe('2026-03-08T10:30:00.000Z')
  })

  it('should handle DST fall-back boundary (November)', () => {
    const afterFall = parseDateAsPst('11/01/2026 03:00:00')
    expect(afterFall!.toISOString()).toBe('2026-11-01T11:00:00.000Z')
  })

  it('should handle ambiguous 1:30 AM during fall-back (favors standard time)', () => {
    // 1:30 AM occurs twice during fall-back. Luxon resolves to standard time (PST, UTC-8).
    const result = parseDateAsPst('11/01/2026 01:30:00')
    expect(result!.toISOString()).toBe('2026-11-01T09:30:00.000Z')
  })
})

describe('round-trip: parse then format (PST)', () => {
  it('should round-trip a winter datetime', () => {
    const original = '01/13/2026 10:51:03'
    const parsed = parseDateAsPst(original)!
    expect(formatDateTimePst(parsed)).toBe(original)
  })

  it('should round-trip a summer datetime', () => {
    const original = '07/15/2026 14:30:00'
    const parsed = parseDateAsPst(original)!
    expect(formatDateTimePst(parsed)).toBe(original)
  })

  it('should round-trip a date-only value', () => {
    const original = '01/13/2026'
    const parsed = parseDateAsPst(original)!
    expect(formatDatePst(parsed)).toBe(original)
  })
})

describe('getAgeCutoffDate', () => {
  it('should return first day of month, 18 years before reference', () => {
    const result = getAgeCutoffDate(new Date(2026, 1, 10))
    expect(result.getFullYear()).toBe(2008)
    expect(result.getMonth()).toBe(1) // February
    expect(result.getDate()).toBe(1)
  })

  it('should return first of month regardless of reference day', () => {
    const result = getAgeCutoffDate(new Date(2026, 1, 28))
    expect(result.getDate()).toBe(1)
    expect(result.getMonth()).toBe(1)
  })

  it('should handle leap day reference (Feb 29->non-leap year)', () => {
    // Feb 29, 2024->18 years back = 2006, which has no Feb 29
    // Without fix: setFullYear rolls to Mar 1 2006, setDate(1)->Mar 1
    // With fix: setDate(1)->Feb 1 2024, setFullYear->Feb 1 2006 ✓
    const result = getAgeCutoffDate(new Date(2024, 1, 29))
    expect(result.getFullYear()).toBe(2006)
    expect(result.getMonth()).toBe(1) // February
    expect(result.getDate()).toBe(1)
  })
})

describe('isEligibleAge', () => {
  const REF_DATE = new Date(2026, 1, 10) // Feb 10, 2026

  it('should return true for child under 18', () => {
    expect(isEligibleAge(new Date(2010, 5, 15), REF_DATE)).toBe(true)
  })

  it('should return true for child turning 18 in current month', () => {
    // Born Feb 5, 2008->eligible through end of Feb 2026
    expect(isEligibleAge(new Date(2008, 1, 5), REF_DATE)).toBe(true)
  })

  it('should return true for child born on first of cutoff month', () => {
    // Born Feb 1, 2008->cutoff is Feb 1, 2008->eligible (>=)
    expect(isEligibleAge(new Date(2008, 1, 1), REF_DATE)).toBe(true)
  })

  it('should return false for child born before cutoff month', () => {
    // Born Jan 31, 2008->cutoff is Feb 1, 2008->not eligible
    expect(isEligibleAge(new Date(2008, 0, 31), REF_DATE)).toBe(false)
  })

  it('should return false for child clearly over 18', () => {
    expect(isEligibleAge(new Date(2005, 5, 15), REF_DATE)).toBe(false)
  })
})
