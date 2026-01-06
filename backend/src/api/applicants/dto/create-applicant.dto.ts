import { PickType } from '@nestjs/swagger'
import { ApplicantDto } from './applicant.dto'

export class CreateApplicantDto extends PickType(ApplicantDto, [
  'last_name',
  'given_name',
  'csa_status',
] as const) {}
