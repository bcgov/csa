import { describe, expect, it } from 'vitest'
import type { OrderRecord, PlacementRecord } from '../eligibility.types'
import { determineCareEndDate } from './determine-care-end-date'

const makeOrder = (overrides: Partial<OrderRecord> = {}): OrderRecord => ({
  orderType: 'Variable',
  orderStatus: 'Closed',
  effectiveStartDate: new Date('2025-01-01'),
  effectiveEndDate: null,
  amount: 100,
  contractNumber: null,
  source: 'ICM',
  ...overrides,
})

const makePlacement = (overrides: Partial<PlacementRecord> = {}): PlacementRecord => ({
  type: 'Placement',
  status: 'Active',
  startDate: new Date('2025-01-01'),
  endDate: null,
  contractNumber: null,
  agreementRowId: null,
  paidUnpaid: null,
  source: 'ICM',
  ...overrides,
})

describe('determineCareEndDate', () => {
  describe('Order/Payment end dates', () => {
    it('should use ICM order effectiveEndDate when status is Closed', () => {
      const result = determineCareEndDate(
        [
          makeOrder({
            effectiveEndDate: new Date('2025-06-15'),
            orderStatus: 'Closed',
            source: 'ICM',
          }),
        ],
        [],
      )
      expect(result).toEqual(new Date('2025-06-15'))
    })

    it('should use MIS payment effectiveEndDate when status is Processed', () => {
      const result = determineCareEndDate(
        [
          makeOrder({
            effectiveEndDate: new Date('2025-07-01'),
            orderStatus: 'Processed',
            source: 'MIS',
          }),
        ],
        [],
      )
      expect(result).toEqual(new Date('2025-07-01'))
    })

    it('should ignore ICM orders not in Closed status', () => {
      const result = determineCareEndDate(
        [
          makeOrder({
            effectiveEndDate: new Date('2025-06-15'),
            orderStatus: 'Approved',
            source: 'ICM',
          }),
        ],
        [],
      )
      expect(result).toBeNull()
    })

    it('should ignore MIS payments not in Processed status', () => {
      const result = determineCareEndDate(
        [
          makeOrder({
            effectiveEndDate: new Date('2025-07-01'),
            orderStatus: 'Pending',
            source: 'MIS',
          }),
        ],
        [],
      )
      expect(result).toBeNull()
    })

    it('should pick the latest end date across ICM and MIS orders', () => {
      const result = determineCareEndDate(
        [
          makeOrder({
            effectiveEndDate: new Date('2025-06-01'),
            orderStatus: 'Closed',
            source: 'ICM',
          }),
          makeOrder({
            effectiveEndDate: new Date('2025-08-01'),
            orderStatus: 'Processed',
            source: 'MIS',
          }),
        ],
        [],
      )
      expect(result).toEqual(new Date('2025-08-01'))
    })
  })

  describe('Signal 2 - Placement end dates', () => {
    it('should use placement endDate', () => {
      const result = determineCareEndDate([], [makePlacement({ endDate: new Date('2025-05-01') })])
      expect(result).toEqual(new Date('2025-05-01'))
    })

    it('should pick the latest end date across multiple placements', () => {
      const result = determineCareEndDate(
        [],
        [
          makePlacement({ endDate: new Date('2025-03-01'), source: 'ICM' }),
          makePlacement({ endDate: new Date('2025-09-01'), source: 'MIS' }),
        ],
      )
      expect(result).toEqual(new Date('2025-09-01'))
    })

    it('should ignore placements with null endDate', () => {
      const result = determineCareEndDate(
        [],
        [makePlacement({ endDate: null }), makePlacement({ endDate: new Date('2025-04-01') })],
      )
      expect(result).toEqual(new Date('2025-04-01'))
    })
  })

  describe('Care End Date - earliest of two signals', () => {
    it('should return the earlier of order date and placement date', () => {
      const result = determineCareEndDate(
        [
          makeOrder({
            effectiveEndDate: new Date('2025-10-01'),
            orderStatus: 'Closed',
            source: 'ICM',
          }),
        ],
        [makePlacement({ endDate: new Date('2025-06-01') })],
      )
      expect(result).toEqual(new Date('2025-06-01'))
    })

    it('should return order date when it is earlier than placement date', () => {
      const result = determineCareEndDate(
        [
          makeOrder({
            effectiveEndDate: new Date('2025-03-01'),
            orderStatus: 'Closed',
            source: 'ICM',
          }),
        ],
        [makePlacement({ endDate: new Date('2025-09-01') })],
      )
      expect(result).toEqual(new Date('2025-03-01'))
    })

    it('should return order date when placement date is null', () => {
      const result = determineCareEndDate(
        [
          makeOrder({
            effectiveEndDate: new Date('2025-06-01'),
            orderStatus: 'Closed',
            source: 'ICM',
          }),
        ],
        [makePlacement({ endDate: null })],
      )
      expect(result).toEqual(new Date('2025-06-01'))
    })

    it('should return placement date when order date is null', () => {
      const result = determineCareEndDate(
        [makeOrder({ effectiveEndDate: null, orderStatus: 'Closed', source: 'ICM' })],
        [makePlacement({ endDate: new Date('2025-05-01') })],
      )
      expect(result).toEqual(new Date('2025-05-01'))
    })
  })

  describe('Both signals null', () => {
    it('should return null when no orders and no placements', () => {
      expect(determineCareEndDate([], [])).toBeNull()
    })

    it('should return null when all end dates are null', () => {
      const result = determineCareEndDate(
        [makeOrder({ effectiveEndDate: null })],
        [makePlacement({ endDate: null })],
      )
      expect(result).toBeNull()
    })
  })
})
