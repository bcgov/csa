import { ApiProperty } from '@nestjs/swagger'
import { ArrayMinSize, IsArray, IsIn, IsNumber } from 'class-validator'

export class ContactIdsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  contactIds: number[]
}

export class ContactIdsWithActionDto extends ContactIdsDto {
  @ApiProperty({ enum: ['ELIGIBLE', 'SET_NOT_ELIGIBLE', 'AGE_OUT'] })
  @IsIn(['ELIGIBLE', 'SET_NOT_ELIGIBLE', 'AGE_OUT'])
  action: string
}
