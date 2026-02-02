import { ApiProperty } from '@nestjs/swagger'

export class AddContactsDto {
  @ApiProperty({ type: [Number], description: 'Array of contact IDs to add to the pending batch' })
  contactIds: number[]
}
