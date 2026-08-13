import { ApiProperty } from '@nestjs/swagger'

export class BatchSummaryDto {
  @ApiProperty()
  id: number

  @ApiProperty({ nullable: true })
  batchDate: Date | null

  @ApiProperty()
  status: string

  @ApiProperty({ description: 'Display label for batch status' })
  statusLabel: string
}

export class ContactSummaryDto {
  @ApiProperty()
  id: number

  @ApiProperty()
  lastName: string

  @ApiProperty()
  firstName: string

  @ApiProperty({ nullable: true })
  din: string | null

  @ApiProperty({ nullable: true })
  csaStatus: string | null

  @ApiProperty({ description: 'Display label for CSA status' })
  csaStatusLabel: string
}

export class ContactBatchDetailDto {
  @ApiProperty()
  id: number

  @ApiProperty()
  contactId: number

  @ApiProperty()
  batchId: number

  @ApiProperty()
  transactionType: string

  @ApiProperty({ nullable: true })
  systemComments: string | null

  @ApiProperty()
  createdAt: Date

  @ApiProperty()
  createdBy: string

  @ApiProperty()
  lastUpdatedAt: Date

  @ApiProperty()
  lastUpdatedBy: string

  @ApiProperty({ nullable: true })
  status: string | null

  @ApiProperty({ description: 'Display label for batch detail status' })
  statusLabel: string

  @ApiProperty({ nullable: true, description: 'Effective date snapshot at time of batching' })
  effectiveDate: Date | null

  @ApiProperty({
    nullable: true,
    description: 'Cancellation reason code snapshot at time of batching',
  })
  cancelReasonCode: string | null

  @ApiProperty({ nullable: true, description: 'Display label for cancellation reason' })
  cancelReasonLabel: string | null
}

export class ContactBatchDetailWithContactDto extends ContactBatchDetailDto {
  @ApiProperty({ type: ContactSummaryDto })
  contact: ContactSummaryDto
}

export class ContactBatchDetailWithBatchDto extends ContactBatchDetailDto {
  @ApiProperty({ type: BatchSummaryDto })
  batch: BatchSummaryDto
}
