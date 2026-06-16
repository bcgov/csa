import { ApiProperty } from '@nestjs/swagger'

export class WeeklyFileSummaryDto {
  @ApiProperty()
  id: number

  @ApiProperty()
  fileName: string

  @ApiProperty({ nullable: true, description: 'CRA weekly file date from WKL header' })
  weeklyFileDate: string | null

  @ApiProperty({ nullable: true, description: 'When CSA finished processing the file' })
  csaProcessingDate: string | null

  @ApiProperty()
  totalCount: number

  @ApiProperty()
  eCount: number

  @ApiProperty()
  matchedCount: number

  @ApiProperty()
  unmatchedCount: number

  @ApiProperty()
  associatedCount: number

  @ApiProperty()
  isProcessed: boolean
}

export class WeeklyFileRecordDto {
  @ApiProperty()
  id: number

  @ApiProperty()
  recordIndex: number

  @ApiProperty({ enum: ['Yes', 'No', 'N/A'] })
  csaMatchFound: 'Yes' | 'No' | 'N/A'

  @ApiProperty()
  matchStatus: string

  @ApiProperty({
    description: 'Mapped display value: Application, Cancellation, CRA Update',
  })
  transactionType: string

  @ApiProperty({ description: 'Mapped display value: Electronic, Other' })
  transactionSource: string

  @ApiProperty()
  din: string

  @ApiProperty()
  firstName: string

  @ApiProperty()
  lastName: string

  @ApiProperty()
  initial: string

  @ApiProperty({
    description: 'Mapped display value: Man / Boy, Woman / Girl, Unknown',
  })
  gender: string

  @ApiProperty({ nullable: true })
  dateOfBirth: string | null

  @ApiProperty()
  birthCity: string

  @ApiProperty()
  birthProvince: string

  @ApiProperty({ description: 'Mapped display value: Canada, Outside Canada' })
  birthCountry: string

  @ApiProperty({ nullable: true })
  careStartDate: string | null

  @ApiProperty({ nullable: true })
  careEndDate: string | null

  @ApiProperty()
  cancelReasonCode: string

  @ApiProperty()
  craStatus: string

  @ApiProperty({ nullable: true })
  completionDate: string | null

  @ApiProperty({ nullable: true })
  associatedCaseNumber: string | null

  @ApiProperty({ nullable: true })
  associatedPersonIdIcm: string | null

  @ApiProperty({
    nullable: true,
    description: 'Batch number when CSA Match Found is Yes',
  })
  batchNumber: number | null

  @ApiProperty({ nullable: true })
  matchedBy: string | null

  @ApiProperty({ nullable: true })
  processedAt: string | null
}
