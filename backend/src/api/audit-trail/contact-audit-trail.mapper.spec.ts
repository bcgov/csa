import { toContactAuditTrailDto } from './contact-audit-trail.mapper'
import { AUDIT_TRAIL_EMPTY_VALUE } from './contact-audit-trail.constants'

describe('toContactAuditTrailDto', () => {
  const actionedAt = new Date('2026-06-01T20:00:00.000Z')

  it('should map new operation with dash placeholders', () => {
    const dto = toContactAuditTrailDto({
      id: 1,
      contactId: 10,
      actionedAt,
      actionedBy: 'SYSTEM',
      operation: 'new',
      field: null,
      oldValue: null,
      newValue: null,
    })

    expect(dto.operation).toBe('New')
    expect(dto.field).toBe(AUDIT_TRAIL_EMPTY_VALUE)
    expect(dto.oldValue).toBe(AUDIT_TRAIL_EMPTY_VALUE)
    expect(dto.newValue).toBe(AUDIT_TRAIL_EMPTY_VALUE)
    expect(dto.actionedBy).toBe('SYSTEM')
  })

  it('should map CSA status codes to display labels', () => {
    const dto = toContactAuditTrailDto({
      id: 2,
      contactId: 10,
      actionedAt,
      actionedBy: 'fin.user',
      operation: 'modify',
      field: 'CSA Status',
      oldValue: 'eligible',
      newValue: 'on_hold',
    })

    expect(dto.operation).toBe('Modify')
    expect(dto.oldValue).toBe('Eligible')
    expect(dto.newValue).toBe('On Hold')
  })
})
