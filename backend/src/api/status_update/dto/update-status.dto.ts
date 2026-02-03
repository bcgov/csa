import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator'

export class UpdateStatusDto {
  @IsNotEmpty()
  @IsString()
  status: string

  @IsOptional()
  @IsString()
  comments?: string

  @IsOptional()
  @IsString()
  updatedBy?: string
}

export class UpdateContactStatusDto extends UpdateStatusDto {
  @IsNotEmpty()
  @IsNumber()
  contactId: number
}

export class UpdateBatchStatusDto extends UpdateStatusDto {
  @IsNotEmpty()
  @IsNumber()
  batchId: number
}

export class UpdateEligibilityStatusDto {
  @IsNotEmpty()
  @IsArray()
  @IsNumber({}, { each: true })
  contactIds: number[]

  @IsOptional()
  @IsString()
  updatedBy?: string
}
