import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ContactAuditTrailDto {
  @ApiProperty({ description: 'Audit trail entry ID' })
  id: number

  @ApiProperty({ description: 'Contact ID' })
  contactId: number

  @ApiProperty({ description: 'Date/time of the change (yyyy-MMM-dd HH:mm:ss Pacific)' })
  date: string

  @ApiProperty({ description: 'SYSTEM or user IDIR' })
  actionedBy: string

  @ApiProperty({ description: 'New or Modify' })
  operation: string

  @ApiProperty({ description: 'Audited field name' })
  field: string

  @ApiProperty({ description: 'Previous value' })
  oldValue: string

  @ApiProperty({ description: 'New value' })
  newValue: string
}

export class ContactAuditTrailQueryDto {
  @ApiPropertyOptional({ description: 'Page number (default: 1)' })
  page?: number

  @ApiPropertyOptional({ description: 'Items per page (default: 10, max: 200)' })
  limit?: number

  @ApiPropertyOptional({ description: 'Filter by contact ID (global audit tab only)' })
  contactId?: number
}
