import { ApiProperty } from '@nestjs/swagger'

export class UserInfoDto {
  @ApiProperty({
    description: 'Username extracted from the auth token',
    example: 'john.doe@example.com',
  })
  username: string

  @ApiProperty({
    description: 'User email',
    example: 'john.doe@example.com',
    required: false,
  })
  email?: string

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  firstName?: string

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  lastName?: string
}
