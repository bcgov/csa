import { ApiProperty } from '@nestjs/swagger'
import { ArrayMinSize, IsArray, IsNumber } from 'class-validator'

export class RemoveContactsDto {
  @ApiProperty({
    type: [Number],
    description: 'Array of contact IDs to remove from the pending batch',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  contactIds: number[]
}
