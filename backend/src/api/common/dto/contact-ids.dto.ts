import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

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

export class HoldContactsDto extends ContactIdsDto {
  @ApiProperty({ description: 'Reason for putting contacts on hold', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  reason: string
}

export class ResumeContactsDto extends ContactIdsDto {
  @ApiPropertyOptional({ description: 'Optional reason for resuming contacts', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string
}

export class UpdateHoldReasonDto {
  @ApiProperty({ description: 'Reason for holding the contact', maxLength: 255 })
  @IsString()
  @IsNotEmpty({ message: "'Reason' cannot be blank when the CSA Status is 'On Hold'." })
  @MaxLength(255)
  reason: string
}
