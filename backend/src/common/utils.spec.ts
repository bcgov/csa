import { describe, expect, it } from 'vitest'
import {
  enrichLabels,
  firstDayOfPreviousMonthPacific,
  formatDatePacific,
  formatDatePacificCompact,
  formatDateTimePacific,
  getAgeCutoffDate,
  isEligibleAge,
  parseCalendarDate,
  parseDateAsPacific,
  parseISODatePacific,
} from './utils'

describe('firstDayOfPreviousMonthPacific', () => {
  it('should return first day of previous month', () => {
    const result = firstDayOfPreviousMonthPacific(new Date('2026-02-15T00:00:00Z'))
    expect(result.getUTCFullYear()).toBe(2026)
    expect(result.getUTCMonth()).toBe(0) // January
    expect(result.getUTCDate()).toBe(1)
  })

  it('should handle January (rolls back to December of previous year)', () => {
    const result = firstDayOfPreviousMonthPacific(new Date('2026-01-10T00:00:00Z'))
    expect(result.getUTCFullYear()).toBe(2025)
    expect(result.getUTCMonth()).toBe(11) // December
    expect(result.getUTCDate()).toBe(1)
  })

  it('should handle March correctly', () => {
    const result = firstDayOfPreviousMonthPacific(new Date('2026-03-31T00:00:00Z'))
    expect(result.getUTCFullYear()).toBe(2026)
    expect(result.getUTCMonth()).toBe(1) // February
    expect(result.getUTCDate()).toBe(1)
  })

  it('should handle May correctly (April has 30 days)', () => {
    const result = firstDayOfPreviousMonthPacific(new Date('2026-05-31T00:00:00Z'))
    expect(result.getUTCFullYear()).toBe(2026)
    expect(result.getUTCMonth()).toBe(3) // April
    expect(result.getUTCDate()).toBe(1)
  })

  it('should use Pacific month, not UTC month (boundary case)', () => {
    // March 1 03:00 UTC = Feb 28 19:00 PST → Pacific month is February
    // Previous Pacific month = January (not February as UTC would give)
    const result = firstDayOfPreviousMonthPacific(new Date('2026-03-01T03:00:00Z'))
    expect(result.getUTCFullYear()).toBe(2026)
    expect(result.getUTCMonth()).toBe(0) // January (Pacific prev month)
    expect(result.getUTCDate()).toBe(1)
  })
})

describe('formatDatePacific', () => {
  it('should format UTC noon as same-day PST', () => {
    expect(formatDatePacific(new Date('2026-01-15T12:00:00Z'))).toBe('01/15/2026')
  })

  it('should format UTC midnight as previous day in PST (winter)', () => {
    expect(formatDatePacific(new Date('2026-01-15T00:00:00Z'))).toBe('01/14/2026')
  })

  it('should format UTC midnight as previous day in PDT (summer)', () => {
    expect(formatDatePacific(new Date('2026-07-15T00:00:00Z'))).toBe('07/14/2026')
  })

  it('should handle UTC 08:00 as same day midnight PST (winter)', () => {
    expect(formatDatePacific(new Date('2026-01-15T08:00:00Z'))).toBe('01/15/2026')
  })

  it('should handle UTC 07:00 as same day midnight PDT (summer)', () => {
    expect(formatDatePacific(new Date('2026-07-15T07:00:00Z'))).toBe('07/15/2026')
  })

  it('should zero-pad month and day', () => {
    expect(formatDatePacific(new Date('2026-03-05T20:00:00Z'))).toBe('03/05/2026')
  })
})

describe('formatDatePacificCompact', () => {
  it('should format as YYYYMMDD in PST (winter)', () => {
    expect(formatDatePacificCompact(new Date('2026-01-15T12:00:00Z'))).toBe('20260115')
  })

  it('should format UTC midnight as previous day in PST', () => {
    expect(formatDatePacificCompact(new Date('2026-01-15T00:00:00Z'))).toBe('20260114')
  })

  it('should format as YYYYMMDD in PDT (summer)', () => {
    expect(formatDatePacificCompact(new Date('2026-07-15T12:00:00Z'))).toBe('20260715')
  })

  it('should zero-pad month and day', () => {
    expect(formatDatePacificCompact(new Date('2026-03-05T20:00:00Z'))).toBe('20260305')
  })
})

describe('formatDateTimePacific', () => {
  it('should format with time in PST (winter)', () => {
    expect(formatDateTimePacific(new Date('2026-01-15T18:30:45Z'))).toBe('01/15/2026 10:30:45')
  })

  it('should format with time in PDT (summer)', () => {
    expect(formatDateTimePacific(new Date('2026-07-15T17:30:00Z'))).toBe('07/15/2026 10:30:00')
  })

  it('should handle midnight PST', () => {
    expect(formatDateTimePacific(new Date('2026-01-15T08:00:00Z'))).toBe('01/15/2026 00:00:00')
  })

  it('should handle 23:59:59 PST', () => {
    expect(formatDateTimePacific(new Date('2026-01-16T07:59:59Z'))).toBe('01/15/2026 23:59:59')
  })

  it('should zero-pad hours, minutes, seconds', () => {
    expect(formatDateTimePacific(new Date('2026-01-15T08:05:03Z'))).toBe('01/15/2026 00:05:03')
  })
})

describe('parseDateAsPacific', () => {
  it('should parse MM/DD/YYYY HH:MM:SS as PST (winter)', () => {
    const result = parseDateAsPacific('01/13/2026 10:51:03')
    expect(result!.toISOString()).toBe('2026-01-13T18:51:03.000Z')
  })

  it('should parse MM/DD/YYYY HH:MM:SS as PDT (summer)', () => {
    const result = parseDateAsPacific('07/15/2026 10:00:00')
    expect(result!.toISOString()).toBe('2026-07-15T17:00:00.000Z')
  })

  it('should parse date-only as PST midnight (winter)', () => {
    const result = parseDateAsPacific('01/13/2026')
    expect(result!.toISOString()).toBe('2026-01-13T08:00:00.000Z')
  })

  it('should parse date-only as PDT midnight (summer)', () => {
    const result = parseDateAsPacific('07/15/2026')
    expect(result!.toISOString()).toBe('2026-07-15T07:00:00.000Z')
  })

  it('should handle midnight timestamp', () => {
    const result = parseDateAsPacific('01/13/2026 00:00:00')
    expect(result!.toISOString()).toBe('2026-01-13T08:00:00.000Z')
  })

  it('should handle 23:59:59 PST', () => {
    const result = parseDateAsPacific('01/13/2026 23:59:59')
    expect(result!.toISOString()).toBe('2026-01-14T07:59:59.000Z')
  })

  it('should return null for empty string', () => {
    expect(parseDateAsPacific('')).toBeNull()
  })

  it('should return null for null', () => {
    expect(parseDateAsPacific(null)).toBeNull()
  })

  it('should return null for undefined', () => {
    expect(parseDateAsPacific(undefined)).toBeNull()
  })

  it('should return null for whitespace-only', () => {
    expect(parseDateAsPacific('   ')).toBeNull()
  })

  it('should handle DST spring-forward boundary (March)', () => {
    const beforeSpring = parseDateAsPacific('03/08/2026 01:30:00')
    expect(beforeSpring!.toISOString()).toBe('2026-03-08T09:30:00.000Z')

    const afterSpring = parseDateAsPacific('03/08/2026 03:30:00')
    expect(afterSpring!.toISOString()).toBe('2026-03-08T10:30:00.000Z')
  })

  it('should handle DST fall-back boundary (November)', () => {
    const afterFall = parseDateAsPacific('11/01/2026 03:00:00')
    expect(afterFall!.toISOString()).toBe('2026-11-01T11:00:00.000Z')
  })

  // it('should handle ambiguous 1:30 AM during fall-back (favors standard time)', () => {
  //   // 1:30 AM occurs twice during fall-back. Luxon resolves to standard time (PST, UTC-8).
  //   const result = parseDateAsPacific('11/01/2026 01:30:00')
  //   expect(result!.toISOString()).toBe('2026-11-01T09:30:00.000Z')
  // })
})

describe('parseCalendarDate', () => {
  it('should parse MM/DD/YYYY to ISO date string', () => {
    expect(parseCalendarDate('01/15/2026')).toBe('2026-01-15')
  })

  it('should not shift date regardless of season', () => {
    expect(parseCalendarDate('07/15/2026')).toBe('2026-07-15')
  })

  it('should return null for empty string', () => {
    expect(parseCalendarDate('')).toBeNull()
  })

  it('should return null for null', () => {
    expect(parseCalendarDate(null)).toBeNull()
  })

  it('should return null for undefined', () => {
    expect(parseCalendarDate(undefined)).toBeNull()
  })

  it('should return null for whitespace-only', () => {
    expect(parseCalendarDate('   ')).toBeNull()
  })
})

describe('round-trip: parse then format (Pacific)', () => {
  it('should round-trip a winter datetime', () => {
    const original = '01/13/2026 10:51:03'
    const parsed = parseDateAsPacific(original)!
    expect(formatDateTimePacific(parsed)).toBe(original)
  })

  it('should round-trip a summer datetime', () => {
    const original = '07/15/2026 14:30:00'
    const parsed = parseDateAsPacific(original)!
    expect(formatDateTimePacific(parsed)).toBe(original)
  })

  it('should round-trip a date-only value', () => {
    const original = '01/13/2026'
    const parsed = parseDateAsPacific(original)!
    expect(formatDatePacific(parsed)).toBe(original)
  })
})

describe('getAgeCutoffDate', () => {
  it('should return first day of month, 18 years before reference', () => {
    const result = getAgeCutoffDate(new Date('2026-02-10T00:00:00.000Z'))
    expect(result.getUTCFullYear()).toBe(2008)
    expect(result.getUTCMonth()).toBe(1) // February
    expect(result.getUTCDate()).toBe(1)
  })

  it('should return first of month regardless of reference day', () => {
    const result = getAgeCutoffDate(new Date('2026-02-28T00:00:00.000Z'))
    expect(result.getUTCDate()).toBe(1)
    expect(result.getUTCMonth()).toBe(1)
  })

  it('should handle leap day reference (Feb 29->non-leap year)', () => {
    const result = getAgeCutoffDate(new Date('2024-02-29T00:00:00.000Z'))
    expect(result.getUTCFullYear()).toBe(2006)
    expect(result.getUTCMonth()).toBe(1) // February
    expect(result.getUTCDate()).toBe(1)
  })
})

describe('isEligibleAge', () => {
  const REF_DATE = new Date('2026-02-10T00:00:00.000Z')

  it('should return true for child under 18', () => {
    expect(isEligibleAge(new Date('2010-06-15T00:00:00.000Z'), REF_DATE)).toBe(true)
  })

  it('should return true for child turning 18 in current month', () => {
    // Born Feb 5, 2008 → eligible through end of Feb 2026
    expect(isEligibleAge(new Date('2008-02-05T00:00:00.000Z'), REF_DATE)).toBe(true)
  })

  it('should return true for child born on first of cutoff month', () => {
    // Born Feb 1, 2008 → cutoff is Feb 1, 2008 → eligible (>=)
    expect(isEligibleAge(new Date('2008-02-01T00:00:00.000Z'), REF_DATE)).toBe(true)
  })

  it('should return false for child born before cutoff month', () => {
    // Born Jan 31, 2008 → cutoff is Feb 1, 2008 → not eligible
    expect(isEligibleAge(new Date('2008-01-31T00:00:00.000Z'), REF_DATE)).toBe(false)
  })

  it('should return false for child clearly over 18', () => {
    expect(isEligibleAge(new Date('2005-06-15T00:00:00.000Z'), REF_DATE)).toBe(false)
  })
})

describe('parseDateAsPacific — DST edge cases', () => {
  it('should handle 2:00 AM during spring-forward (nonexistent time)', () => {
    const result = parseDateAsPacific('03/08/2026 02:00:00')
    expect(result).not.toBeNull()
    expect(result!.toISOString()).toBe('2026-03-08T10:00:00.000Z')
  })

  it('should handle 2:30 AM during spring-forward (nonexistent time)', () => {
    const result = parseDateAsPacific('03/08/2026 02:30:00')
    expect(result).not.toBeNull()
    expect(result!.toISOString()).toBe('2026-03-08T10:30:00.000Z')
  })

  it('should parse date-only on spring-forward day as midnight PST', () => {
    const result = parseDateAsPacific('03/08/2026')
    expect(result!.toISOString()).toBe('2026-03-08T08:00:00.000Z')
  })

  it('should parse date-only on fall-back day as midnight PDT', () => {
    const result = parseDateAsPacific('11/01/2026')
    expect(result!.toISOString()).toBe('2026-11-01T07:00:00.000Z')
  })
})

describe('parseISODatePacific', () => {
  it('should parse date-only string as Pacific midnight', () => {
    // PST (UTC-8): 2026-01-09T00:00:00-08:00 = 2026-01-09T08:00:00Z
    const result = parseISODatePacific('2026-01-09')
    expect(result.toISOString()).toBe('2026-01-09T08:00:00.000Z')
  })

  it('should preserve the calendar date in Pacific time', () => {
    // The whole point: this should NOT shift to Jan 8 in Pacific
    const result = parseISODatePacific('2026-01-09')
    expect(result.toISOString().split('T')[0]).toBe('2026-01-09')
  })

  it('should pass through full datetime strings unchanged', () => {
    const result = parseISODatePacific('2026-01-09T14:30:00.000Z')
    expect(result.toISOString()).toBe('2026-01-09T14:30:00.000Z')
  })

  it('should handle PDT (summer) date-only correctly', () => {
    // PDT (UTC-7): 2026-07-15T00:00:00-07:00 = 2026-07-15T07:00:00Z
    const result = parseISODatePacific('2026-07-15')
    expect(result.toISOString()).toBe('2026-07-15T07:00:00.000Z')
  })

  it('should handle spring-forward date', () => {
    const result = parseISODatePacific('2026-03-08')
    expect(result.toISOString()).toBe('2026-03-08T08:00:00.000Z')
  })

  it('should handle fall-back date (PST after DST ends)', () => {
    // Dec 1 2026 is in PST (UTC-8)
    const result = parseISODatePacific('2026-12-01')
    expect(result.toISOString()).toBe('2026-12-01T08:00:00.000Z')
  })

  it('should not reinterpret full datetime at midnight UTC as Pacific', () => {
    const result = parseISODatePacific('2026-01-09T00:00:00.000Z')
    expect(result.toISOString()).toBe('2026-01-09T00:00:00.000Z')
  })
})

describe('isEligibleAge — timezone boundary cases', () => {
  it('should handle DOB as Prisma DATE (midnight UTC)', () => {
    const dob = new Date('2008-02-01T00:00:00.000Z')
    const ref = new Date('2026-02-10T00:00:00.000Z')
    expect(isEligibleAge(dob, ref)).toBe(true)
  })

  it('should handle DOB one day before cutoff (Jan 31, 2008)', () => {
    const dob = new Date('2008-01-31T00:00:00.000Z')
    const ref = new Date('2026-02-10T00:00:00.000Z')
    expect(isEligibleAge(dob, ref)).toBe(false)
  })

  it('should handle reference date at month boundary (March 1)', () => {
    const ref = new Date('2026-03-01T00:00:00.000Z')
    expect(isEligibleAge(new Date('2008-02-28T00:00:00.000Z'), ref)).toBe(false)
    expect(isEligibleAge(new Date('2008-03-01T00:00:00.000Z'), ref)).toBe(true)
  })
})

describe('enrichLabels', () => {
  it('should convert DATE-only fields from Date to YYYY-MM-DD string', () => {
    const record = {
      dateOfBirth: new Date('2012-03-15T00:00:00.000Z'),
      effectiveDate: new Date('2025-01-10T00:00:00.000Z'),
      expiryDate: new Date('2026-12-31T00:00:00.000Z'),
    }
    const result = enrichLabels(record)
    expect(result.dateOfBirth).toBe('2012-03-15')
    expect(result.effectiveDate).toBe('2025-01-10')
    expect(result.expiryDate).toBe('2026-12-31')
  })

  it('should convert all 7 DATE-only fields', () => {
    const record = {
      dateOfBirth: new Date('2012-03-15T00:00:00.000Z'),
      effectiveDate: new Date('2025-01-10T00:00:00.000Z'),
      expiryDate: new Date('2026-12-31T00:00:00.000Z'),
      orderEffectiveStartDate: new Date('2025-06-01T00:00:00.000Z'),
      orderEffectiveEndDate: new Date('2025-12-01T00:00:00.000Z'),
      careEndDate: new Date('2026-03-01T00:00:00.000Z'),
      batchDate: new Date('2026-02-20T00:00:00.000Z'),
    }
    const result = enrichLabels(record)
    expect(result.dateOfBirth).toBe('2012-03-15')
    expect(result.orderEffectiveStartDate).toBe('2025-06-01')
    expect(result.orderEffectiveEndDate).toBe('2025-12-01')
    expect(result.careEndDate).toBe('2026-03-01')
    expect(result.batchDate).toBe('2026-02-20')
  })

  it('should not convert null or missing DATE-only fields', () => {
    const record = { dateOfBirth: null, firstName: 'John' }
    const result = enrichLabels(record)
    expect(result.dateOfBirth).toBeNull()
    expect(result).not.toHaveProperty('effectiveDate')
  })

  it('should not convert TIMESTAMPTZ fields', () => {
    const ts = new Date('2025-06-15T14:30:00.000Z')
    const record = { csaStatusEffectiveDate: ts, csaSentDate: ts }
    const result = enrichLabels(record)
    expect(result.csaStatusEffectiveDate).toBeInstanceOf(Date)
    expect(result.csaSentDate).toBeInstanceOf(Date)
  })

  it('should convert placement/agreement date fields to date-only strings', () => {
    const ts = new Date('2025-06-15T14:30:00.000Z')
    const record = { actualStartDate: ts, agreementStartDate: ts, terminationDate: ts }
    const result = enrichLabels(record)
    expect(result.actualStartDate).toBe('2025-06-15')
    expect(result.agreementStartDate).toBe('2025-06-15')
    expect(result.terminationDate).toBe('2025-06-15')
  })

  it('should still add labels and flags alongside date conversion', () => {
    const record = {
      csaStatus: 'eligible',
      dateOfBirth: new Date('2012-03-15T00:00:00.000Z'),
    }
    const result = enrichLabels(record)
    expect(result.csaStatusLabel).toBe('Eligible')
    expect(result.dateOfBirth).toBe('2012-03-15')
    expect(result.isOver18).toBeDefined()
  })
})
