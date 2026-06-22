import { describe, expect, test, vi } from 'vitest'
import {
  buildPlacementDisplayValues,
  isMockSection54Placement,
  normalizeMatchValue,
} from '../mock-placement'

describe('mock placement helpers', () => {
  test('normalizeMatchValue trims and uppercases values', () => {
    expect(normalizeMatchValue('  Active  ')).toBe('ACTIVE')
    expect(normalizeMatchValue(undefined)).toBe('')
  })

  test('detects mock Section 54 placement regardless of case', () => {
    expect(
      isMockSection54Placement({
        placementLocation: '0',
        locationType: 'pl',
        locationSubType: '54',
        placementStatus: 'active',
      }),
    ).toBe(true)

    expect(
      isMockSection54Placement({
        placementLocation: ' 0 ',
        locationType: 'PL',
        locationSubType: '54',
        placementStatus: 'ACTIVE',
      }),
    ).toBe(true)
  })

  test('does not detect mock placement when one required value differs', () => {
    expect(
      isMockSection54Placement({
        placementLocation: '1',
        locationType: 'PL',
        locationSubType: '54',
        placementStatus: 'Active',
      }),
    ).toBe(false)
  })

  test('hides placement fields for mock Section 54 placement', () => {
    const formatDateYMD = vi.fn((value: string) => `formatted:${value}`)

    const result = buildPlacementDisplayValues(
      {
        placementLocation: '0',
        locationType: 'PL',
        locationSubType: '54',
        placementStatus: 'Active',
        actualStartDate: '2024-01-01',
        actualEndDate: '2024-01-31',
        paidUnpaid: 'Paid',
        sourcePlacement: 'MIS',
        placeOfServiceName: 'Mock place',
      },
      formatDateYMD,
    )

    expect(result).toEqual({
      placementLocation: '',
      locationType: '',
      locationSubType: '',
      placementStatus: '',
      actualStartDate: '',
      actualEndDate: '',
      paidUnpaid: '',
      sourcePlacement: '',
      placeOfServiceName: '',
    })
    expect(formatDateYMD).not.toHaveBeenCalled()
  })

  test('keeps placement fields for non-mock placement and formats dates', () => {
    const formatDateYMD = vi.fn((value: string) => `formatted:${value}`)

    const result = buildPlacementDisplayValues(
      {
        placementLocation: '123',
        locationType: 'PL',
        locationSubType: '12',
        placementStatus: 'Active',
        actualStartDate: '2024-01-01',
        actualEndDate: '2024-01-31',
        paidUnpaid: 'Paid',
        sourcePlacement: 'ICM',
        placeOfServiceName: 'Real place',
      },
      formatDateYMD,
    )

    expect(result).toEqual({
      placementLocation: '123',
      locationType: 'PL',
      locationSubType: '12',
      placementStatus: 'Active',
      actualStartDate: 'formatted:2024-01-01',
      actualEndDate: 'formatted:2024-01-31',
      paidUnpaid: 'Paid',
      sourcePlacement: 'ICM',
      placeOfServiceName: 'Real place',
    })
    expect(formatDateYMD).toHaveBeenCalledTimes(2)
  })
})
