import { ApiProperty } from '@nestjs/swagger'

export class PermissionDto {
  @ApiProperty({
    description: 'Permission identifier',
    example: 'applicants.read',
  })
  id: string

  @ApiProperty({
    description: 'Permission display name',
    example: 'Read Applicants',
  })
  name: string

  @ApiProperty({
    description: 'Permission description',
    example: 'Allows viewing applicant information',
  })
  description: string

  @ApiProperty({
    description: 'Resource the permission applies to',
    example: 'applicants',
  })
  resource: string

  @ApiProperty({
    description: 'Action the permission allows',
    example: 'read',
  })
  action: string
}

export class UserPermissionsDto {
  @ApiProperty({
    description: 'Username',
    example: 'john.doe@example.com',
  })
  username: string

  @ApiProperty({
    description: 'List of permissions assigned to the user',
    type: [PermissionDto],
  })
  permissions: PermissionDto[]

  @ApiProperty({
    description: 'List of responsibilities/roles assigned to the user',
    type: [String],
    example: ['admin', 'reviewer', 'approver'],
  })
  responsibilities: string[]

  @ApiProperty({
    description: 'Timestamp when permissions were retrieved',
    example: '2024-01-19T16:30:00Z',
  })
  retrievedAt: string
}
