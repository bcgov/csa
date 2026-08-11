import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator'
import { CSA_STATUS } from 'src/common/state-machine/constants'

export class ContactDto {
  // REQUIRED FIELDS (NOT NULL)
  @ApiProperty({ description: 'The unique ID of the contact' })
  id: number

  @ApiProperty({ description: 'The last name of the contact' })
  lastName: string

  @ApiProperty({ description: 'The given names of the contact' })
  firstName: string

  @ApiProperty({ description: 'The middle name of the contact' })
  middleName: string

  @ApiProperty({ description: 'The alias last name of the contact' })
  akaLastName: string

  @ApiProperty({ description: 'The alias first name of the contact' })
  akaFirstName: string

  @ApiProperty({ description: 'ICM person identifier' })
  personIdIcm: string

  @ApiProperty({ description: 'IMS person identifier' })
  personIdMis: string

  @ApiProperty({ description: 'Primary case number associated with the contact' })
  caseNumber: string

  @ApiProperty({ description: 'The type of case' })
  caseType: string

  @ApiProperty({ description: 'The status of the case' })
  caseStatus: string

  @ApiProperty({ description: 'The caseload or grouping' })
  caseLoad: string

  @ApiProperty({ description: 'Source of the order data' })
  sourceOrder: string

  @ApiProperty({ description: 'Indicates whether to update ICM' })
  icmIntegrationStatus: boolean

  @ApiProperty({ description: 'Record creation timestamp' })
  createdAt: Date

  @ApiProperty({ description: 'User who created the record' })
  createdBy: string

  @ApiProperty({ description: 'Last update timestamp' })
  lastUpdatedAt: Date

  @ApiProperty({ description: 'User who last updated the record' })
  lastUpdatedBy: string

  // OPTIONAL FIELDS (NULLABLE IN SQL)
  @ApiPropertyOptional({ description: 'Gender of the contact' })
  gender?: string

  @ApiPropertyOptional({ description: 'Date of birth of the contact' })
  dateOfBirth?: Date

  @ApiPropertyOptional({ description: 'Age of the contact' })
  age?: number

  @ApiPropertyOptional({ description: 'Legacy file number if applicable' })
  legacyFileNumber?: string

  @ApiPropertyOptional({ description: 'Service office handling the case' })
  serviceOffice?: string

  @ApiPropertyOptional({ description: 'Person assigned to the case' })
  assignedTo?: string

  @ApiPropertyOptional({ description: 'CSA status of the contact' })
  csaStatus?: string

  @ApiPropertyOptional({ description: 'Display label for CSA status' })
  csaStatusLabel?: string

  @ApiPropertyOptional({ description: 'Effective date of the CSA status' })
  csaStatusEffectiveDate?: Date

  @ApiPropertyOptional({
    description: 'When eligibility last ran decision rules on this contact (BL-14C watermark)',
  })
  lastEligibilityRunAt?: Date

  @ApiPropertyOptional({ description: 'Date CSA was sent' })
  csaSentDate?: Date

  @ApiPropertyOptional({ description: 'DIN identifier if applicable' })
  din?: string

  @ApiPropertyOptional({ description: 'Legal status currently effective' })
  effectiveLegalStatus?: string

  @ApiPropertyOptional({ description: 'Effective date of the legal status' })
  effectiveDate?: Date

  @ApiPropertyOptional({ description: 'Expiry date related to legal status or case' })
  expiryDate?: Date

  @ApiPropertyOptional({ description: 'CSA enrollment indicator' })
  enrollForCsa?: string

  @ApiPropertyOptional({ description: 'MIS legal authority code' })
  misLegalAuthorityCode?: string

  @ApiPropertyOptional({ description: 'Legal authority code' })
  legalAuthorityCode?: string

  @ApiPropertyOptional({ description: 'Birth city of the contact' })
  birthCity?: string

  @ApiPropertyOptional({ description: 'Birth province of the contact' })
  birthProvince?: string

  @ApiPropertyOptional({ description: 'Birth country of the contact' })
  birthCountry?: string

  @ApiPropertyOptional({ description: 'Placement location' })
  placementLocation?: string

  @ApiPropertyOptional({ description: 'Placement location type' })
  locationType?: string

  @ApiPropertyOptional({ description: 'Placement sub-location type' })
  locationSubType?: string

  @ApiPropertyOptional({ description: 'Placement status' })
  placementStatus?: string

  @ApiPropertyOptional({ description: 'Start date of placement' })
  actualStartDate?: Date

  @ApiPropertyOptional({ description: 'End date of placement' })
  actualEndDate?: Date

  @ApiPropertyOptional({ description: 'Whether placement is paid or unpaid' })
  paidUnpaid?: string

  @ApiPropertyOptional({ description: 'Whether placement was interrupted' })
  interruptedPlacement?: string

  @ApiPropertyOptional({ description: 'Source of the primary placement (ICM or MIS)' })
  sourcePlacement?: string

  @ApiPropertyOptional({ description: 'Service provider name' })
  serviceProviderName?: string

  @ApiPropertyOptional({ description: 'Provider identifier' })
  providerId?: string

  @ApiPropertyOptional({ description: 'Place of service name' })
  placeOfServiceName?: string

  @ApiPropertyOptional({ description: 'Type of agreement' })
  agreementType?: string

  @ApiPropertyOptional({ description: 'Agreement status' })
  agreementStatus?: string

  @ApiPropertyOptional({ description: 'Start date of the agreement' })
  agreementStartDate?: Date

  @ApiPropertyOptional({ description: 'End date of the agreement' })
  agreementEndDate?: Date

  @ApiPropertyOptional({ description: 'Termination date' })
  terminationDate?: Date

  @ApiPropertyOptional({ description: 'MCFD contract identifier' })
  mcfdContract?: string

  @ApiPropertyOptional({ description: 'Source of the primary agreement or contract (ICM or MIS)' })
  sourceAgreement?: string

  @ApiPropertyOptional({ description: 'Order number' })
  orderNumber?: string

  @ApiPropertyOptional({ description: 'Order type' })
  orderType?: string

  @ApiPropertyOptional({ description: 'Order status' })
  orderStatus?: string

  @ApiPropertyOptional({ description: 'Order amount' })
  orderAmount?: string

  @ApiPropertyOptional({ description: 'Order effective start date' })
  orderEffectiveStartDate?: Date

  @ApiPropertyOptional({ description: 'Product type related to the contact' })
  product?: string
}

/**
 * DTO for updating CSA source-of-truth fields (BL-36)
 * Only Data Quality Stewards can update these fields
 */
export class UpdateContactDto {
  @ApiPropertyOptional({
    description: 'DIN (Document Identification Number) - exactly 9 numeric digits',
    example: '123456782',
    pattern: '^\\d{9}$',
  })
  @IsOptional()
  @IsString()
  @Length(9, 9, { message: 'DIN must be exactly 9 digits' })
  @Matches(/^\d{9}$/, { message: 'DIN must contain only numeric digits' })
  din?: string

  @ApiPropertyOptional({
    description: 'CSA Status code',
    example: 'eligible',
    enum: Object.values(CSA_STATUS),
  })
  @IsOptional()
  @IsString()
  @IsIn(Object.values(CSA_STATUS), { message: 'Invalid CSA Status.' })
  csaStatus?: string

  @ApiPropertyOptional({
    description: 'Effective date of the CSA status (ISO 8601 format)',
    example: '2026-08-03T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'CSA Status Effective Date must be a valid ISO 8601 date' })
  csaStatusEffectiveDate?: Date
}
