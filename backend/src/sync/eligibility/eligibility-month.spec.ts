import { describe, expect, it } from 'vitest'
import { getPreviousMonth, isInMonth } from './eligibility-month'

describe('eligibility-month', () => {
  describe('getPreviousMonth', () => {
    it('returns prior calendar month in UTC', () => {
      expect(getPreviousMonth(new Date('2026-05-15T12:00:00Z'))).toEqual({ year: 2026, month: 3 })
    })

    it('rolls back year when reference is January', () => {
      expect(getPreviousMonth(new Date('2026-01-10T00:00:00Z'))).toEqual({ year: 2025, month: 11 })
    })
  })

  describe('isInMonth', () => {
    it('returns false when date is null', () => {
      expect(isInMonth(null, { year: 2026, month: 3 })).toBe(false)
    })

    it('matches when date falls in the given month', () => {
      expect(isInMonth(new Date('2026-04-01T00:00:00Z'), { year: 2026, month: 3 })).toBe(true)
    })

    it('does not match other months', () => {
      expect(isInMonth(new Date('2026-05-01T00:00:00Z'), { year: 2026, month: 3 })).toBe(false)
    })
  })
})
