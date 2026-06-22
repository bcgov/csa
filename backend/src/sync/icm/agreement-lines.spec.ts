import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { filterValidOocAgreementLineItems } from './agreement-lines'

describe('filterValidOocAgreementLineItems', () => {
  it('keeps lines with id, agreement id, and person id', () => {
    const items = [
      {
        Id: 'mock-line-001',
        'Agreement Id': 'mock-agreement-001',
        'ICM Person ID': 'mock-person-001',
        Updated: '05/26/2026 10:00:00',
      },
    ]

    expect(filterValidOocAgreementLineItems(items)).toHaveLength(1)
  })

  it('skips lines missing required join keys', () => {
    const items = [
      {
        Id: 'mock-line-001',
        'Agreement Id': 'mock-agreement-001',
        'ICM Person ID': 'mock-person-001',
      },
      { Id: 'mock-line-002', 'Agreement Id': 'mock-agreement-002', 'ICM Person ID': '' },
      { Id: '', 'Agreement Id': 'mock-agreement-003', 'ICM Person ID': 'mock-person-003' },
      { Id: 'mock-line-004', 'Agreement Id': '', 'ICM Person ID': 'mock-person-004' },
    ]

    const result = filterValidOocAgreementLineItems(items)

    expect(result).toHaveLength(1)
    expect(result[0]['Id']).toBe('mock-line-001')
  })

  it('warns when skipping invalid lines', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})

    filterValidOocAgreementLineItems([
      {
        Id: 'mock-line-001',
        'Agreement Id': 'mock-agreement-001',
        'ICM Person ID': 'mock-person-001',
      },
      { Id: 'mock-line-002', 'Agreement Id': 'mock-agreement-002', 'ICM Person ID': '' },
    ])

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      'Skipping agreement line missing join keys (ICM Person ID): Id=mock-line-002',
    )

    warnSpy.mockRestore()
  })

  it('filters flat AgreementLines API items', () => {
    const items = [
      {
        Id: 'mock-line-001',
        'Agreement Id': 'mock-agreement-001',
        'ICM Person ID': '',
        Updated: '05/26/2026 10:00:00',
      },
      {
        Id: 'mock-line-002',
        'Agreement Id': 'mock-agreement-001',
        'ICM Person ID': 'mock-person-001',
        Updated: '05/26/2026 10:00:00',
      },
    ]

    const result = filterValidOocAgreementLineItems(items)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      Id: 'mock-line-002',
      'Agreement Id': 'mock-agreement-001',
      'ICM Person ID': 'mock-person-001',
      Updated: '05/26/2026 10:00:00',
    })
  })
})
