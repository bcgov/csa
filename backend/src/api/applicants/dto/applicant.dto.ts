import { ApiProperty } from '@nestjs/swagger'

export class ApplicantDto {
  @ApiProperty({
    description: 'The ID of the applicant',
  })
  id: number

  @ApiProperty({
    description: 'The last name of the applicant',
  })
  last_name: string

  @ApiProperty({
    description: 'The given name of the applicant',
  })
  given_name: string

  @ApiProperty({
    description: 'The csa status of the applicant',
  })
  csa_status: string
}
