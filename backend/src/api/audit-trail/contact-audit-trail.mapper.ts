import { DateTime } from 'luxon'
import { CSA_STATUS_LABELS } from 'src/common/state-machine/constants/csa-status.constants'
import {
  AUDIT_TRAIL_EMPTY_VALUE,
  AUDIT_TRAIL_FIELD,
  AUDIT_TRAIL_OPERATION,
} from './contact-audit-trail.constants'
import { ContactAuditTrailDto } from './dto/contact-audit-trail.dto'

const PACIFIC_ZONE = 'America/Vancouver'

type AuditTrailRow = {
  id: number
  contactId: number
  actionedAt: Date
  actionedBy: string
  operation: string
  field: string | null
  oldValue: string | null
  newValue: string | null
}

function formatAuditDateTime(date: Date): string {
  return DateTime.fromJSDate(date).setZone(PACIFIC_ZONE).toFormat('yyyy-MMM-dd HH:mm:ss')
}

function formatAuditFieldValue(field: string | null, value: string | null): string {
  if (value === null || value.trim() === '') {
    return AUDIT_TRAIL_EMPTY_VALUE
  }

  if (field === AUDIT_TRAIL_FIELD.CSA_STATUS) {
    return CSA_STATUS_LABELS[value] ?? value
  }

  if (field === AUDIT_TRAIL_FIELD.STATUS_EFFECTIVE_DATE) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return formatAuditDateTime(parsed)
    }
  }

  return value
}

function formatOperation(operation: string): string {
  return operation === AUDIT_TRAIL_OPERATION.NEW ? 'New' : 'Modify'
}

export function toContactAuditTrailDto(row: AuditTrailRow): ContactAuditTrailDto {
  const isNew = row.operation === AUDIT_TRAIL_OPERATION.NEW

  return {
    id: row.id,
    contactId: row.contactId,
    date: formatAuditDateTime(row.actionedAt),
    actionedBy: row.actionedBy,
    operation: formatOperation(row.operation),
    field: isNew ? AUDIT_TRAIL_EMPTY_VALUE : (row.field ?? AUDIT_TRAIL_EMPTY_VALUE),
    oldValue: isNew ? AUDIT_TRAIL_EMPTY_VALUE : formatAuditFieldValue(row.field, row.oldValue),
    newValue: isNew ? AUDIT_TRAIL_EMPTY_VALUE : formatAuditFieldValue(row.field, row.newValue),
  }
}
