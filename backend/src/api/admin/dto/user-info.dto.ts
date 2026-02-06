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

  @ApiProperty({
    description: 'User subject identifier',
    example: 'a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6',
    required: false,
  })
  sub?: string

  @ApiProperty({
    description: 'Token expiration timestamp',
    example: 1674567890,
    required: false,
  })
  exp?: number
}
