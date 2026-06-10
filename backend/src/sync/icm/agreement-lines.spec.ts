import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { filterValidOocAgreementLineItems } from './agreement-lines'

describe('filterValidOocAgreementLineItems', () => {
  it('keeps lines with id, agreement id, and person id', () => {
    const items = [
      {
        Id: 'LINE-a11f8820',
        'Agreement Id': 'AGR-c1d94e55',
        'ICM Person ID': 'KP-mock-44001',
        Updated: '05/26/2026 10:00:00',
      },
    ]

    expect(filterValidOocAgreementLineItems(items)).toHaveLength(1)
  })

  it('skips lines missing required join keys', () => {
    const items = [
      { Id: 'LINE-1', 'Agreement Id': 'AGR-1', 'ICM Person ID': 'PERSON-1' },
      { Id: 'LINE-2', 'Agreement Id': 'AGR-2', 'ICM Person ID': '' },
      { Id: '', 'Agreement Id': 'AGR-3', 'ICM Person ID': 'PERSON-3' },
      { Id: 'LINE-4', 'Agreement Id': '', 'ICM Person ID': 'PERSON-4' },
    ]

    const result = filterValidOocAgreementLineItems(items)

    expect(result).toHaveLength(1)
    expect(result[0]['Id']).toBe('LINE-1')
  })

  it('warns when skipping invalid lines', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})

    filterValidOocAgreementLineItems([
      { Id: 'LINE-1', 'Agreement Id': 'AGR-1', 'ICM Person ID': 'PERSON-1' },
      { Id: 'LINE-2', 'Agreement Id': 'AGR-2', 'ICM Person ID': '' },
    ])

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      'Skipping agreement line missing join keys (ICM Person ID): Id=LINE-2',
    )

    warnSpy.mockRestore()
  })
})
