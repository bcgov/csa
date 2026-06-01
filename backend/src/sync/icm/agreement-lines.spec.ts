import { describe, expect, it } from 'vitest'
import { expandAgreementLineItems } from './agreement-lines'

describe('expandAgreementLineItems', () => {
  it('expands to one row per line with agreement id and person id', () => {
    const items = [
      {
        Id: 'AGR-c1d94e55',
        Updated: '05/26/2026 10:00:00',
        AgreementLines: [
          { Id: 'LINE-a11f8820', 'ICM Person ID': 'KP-mock-44001' },
          { Id: 'LINE-b22e9931', 'ICM Person ID': 'KP-mock-44001' },
        ],
      },
    ]

    const result = expandAgreementLineItems(items)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      Id: 'LINE-a11f8820',
      'Agreement Id': 'AGR-c1d94e55',
      'ICM Person ID': 'KP-mock-44001',
      Updated: '05/26/2026 10:00:00',
    })
    expect(result[1]['Id']).toBe('LINE-b22e9931')
  })

  it('skips agreements without lines or lines without person id', () => {
    const items = [
      { Id: 'AGR-no-lines', Updated: '05/26/2026 10:00:00' },
      {
        Id: 'AGR-empty-person',
        AgreementLines: [{ Id: 'LINE-x', 'ICM Person ID': '' }],
      },
    ]

    expect(expandAgreementLineItems(items)).toEqual([])
  })
})
