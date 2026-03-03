import { ApiProperty } from '@nestjs/swagger'

export class BatchDto {
  @ApiProperty()
  id: number

  @ApiProperty({ nullable: true })
  batchDate: Date | null

  @ApiProperty()
  status: string

  @ApiProperty({ description: 'Display label for batch status' })
  statusLabel: string

  @ApiProperty()
  recordCount: number

  @ApiProperty()
  createdAt: Date

  @ApiProperty({ nullable: true })
  systemComments: string | null
}
