import { ApiProperty } from '@nestjs/swagger'
import { IsInt, Min } from 'class-validator'

export class AssociateWklRecordDto {
  @ApiProperty({ description: 'CSA contact ID to associate with the WKL record' })
  @IsInt()
  @Min(1)
  contactId: number
}

export class ReprocessWeeklyFileResultDto {
  @ApiProperty({ type: [Number] })
  processedRecordIds: number[]

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        recordId: { type: 'number' },
        reason: { type: 'string' },
      },
    },
  })
  skippedRecords: { recordId: number; reason: string }[]
}
