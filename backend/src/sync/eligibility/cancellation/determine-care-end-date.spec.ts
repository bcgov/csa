import { describe, expect, it } from 'vitest'
import { makePlacement } from '../test-helpers'
import { determineCareEndDate } from './determine-care-end-date'

describe('determineCareEndDate', () => {
  describe('Placement end dates', () => {
    it('should use placement endDate', () => {
      const result = determineCareEndDate([makePlacement({ endDate: new Date('2025-05-01') })])
      expect(result).toEqual(new Date('2025-05-01'))
    })

    it('should pick the latest end date across multiple placements', () => {
      const result = determineCareEndDate([
        makePlacement({ endDate: new Date('2025-03-01'), source: 'ICM' }),
        makePlacement({ endDate: new Date('2025-09-01'), source: 'MIS' }),
      ])
      expect(result).toEqual(new Date('2025-09-01'))
    })

    it('should ignore placements with null endDate', () => {
      const result = determineCareEndDate([
        makePlacement({ endDate: null }),
        makePlacement({ endDate: new Date('2025-04-01') }),
      ])
      expect(result).toEqual(new Date('2025-04-01'))
    })
  })

  describe('No placement end dates', () => {
    it('should return null when no placements', () => {
      expect(determineCareEndDate([])).toBeNull()
    })

    it('should return null when all end dates are null', () => {
      const result = determineCareEndDate([makePlacement({ endDate: null })])
      expect(result).toBeNull()
    })
  })
})
