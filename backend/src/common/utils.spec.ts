import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatDateTime,
  firstDayOfPreviousMonth,
  getAgeCutoffDate,
  isEligibleAge,
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

  it('should handle leap day reference (Feb 29 → non-leap year)', () => {
    // Feb 29, 2024 → 18 years back = 2006, which has no Feb 29
    // Without fix: setFullYear rolls to Mar 1 2006, setDate(1) → Mar 1
    // With fix: setDate(1) → Feb 1 2024, setFullYear → Feb 1 2006 ✓
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
    // Born Feb 5, 2008 → eligible through end of Feb 2026
    expect(isEligibleAge(new Date(2008, 1, 5), REF_DATE)).toBe(true)
  })

  it('should return true for child born on first of cutoff month', () => {
    // Born Feb 1, 2008 → cutoff is Feb 1, 2008 → eligible (>=)
    expect(isEligibleAge(new Date(2008, 1, 1), REF_DATE)).toBe(true)
  })

  it('should return false for child born before cutoff month', () => {
    // Born Jan 31, 2008 → cutoff is Feb 1, 2008 → not eligible
    expect(isEligibleAge(new Date(2008, 0, 31), REF_DATE)).toBe(false)
  })

  it('should return false for child clearly over 18', () => {
    expect(isEligibleAge(new Date(2005, 5, 15), REF_DATE)).toBe(false)
  })
})
