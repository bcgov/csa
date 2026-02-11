import { CsaStatus } from 'src/common/state-machine/constants/csa-status.constants'

// Denormalized contact loaded from staging tables + existing master data
export interface ContactProfile {
  personIdIcm: string
  personIdMis: string

  firstName: string
  lastName: string
  middleName: string
  akaFirstName: string | null
  akaLastName: string | null
  dateOfBirth: Date | null
  age: number | null
  gender: string | null

  caseNumber: string
  caseType: string
  caseStatus: string
  caseLoad: string
  legacyFileNumber: string | null
  serviceOffice: string | null
  assignedTo: string | null

  csaStatus: CsaStatus | null
  existingContactId: number | null
  din: string | null
  csaSentDate: Date | null

  misLegalAuthCode: string | null
  enrollForCsa: string | null
  legalExpiryDate: Date | null
  effectiveLegalStatus: string | null
  legalAuthorityCode: string | null
  effectiveDate: Date | null

  birthCity: string | null
  birthProvince: string | null
  birthCountry: string | null

  isInEligible: boolean

  placements: PlacementRecord[]
  orders: OrderRecord[]
  agreements: AgreementRecord[]
}

/** Placement from ICM or MIS staging */
export interface PlacementRecord {
  type: string // 'Placement' | 'Non-Placement Location'
  status: string // 'Active' | 'Interrupted' | ...
  startDate: Date | null
  endDate: Date | null
  contractNumber: string | null
  agreementRowId: string | null
  paidUnpaid: string | null
  source: 'ICM' | 'MIS'

  // master fields carried through to populate master table
  placementNumber?: string | null
  serviceType?: string | null
  serviceProviderName?: string | null
  providerId?: string | null
  placeOfServiceName?: string | null
  interruptedPlacementId?: string | null
}

//Order (ICM) or Payment (MIS) staging
export interface OrderRecord {
  orderType: string
  orderStatus: string
  effectiveStartDate: Date | null
  amount: number
  contractNumber: string | null
  source: 'ICM' | 'MIS'

  // master fields carried through to populate master table
  orderNumber?: string | null
  product?: string | null
  agreementRowId?: string | null
}

// Agreement from ICM staging
export interface AgreementRecord {
  rowId: string
  agreementType: string | null
  agreementStatus: string | null
  agreementStartDate: Date | null
  agreementEndDate: Date | null
  terminationDate: Date | null
  mcfdContract: string | null
}

// Result of running the eligibility decision tree on one contact/case
export interface EligibilityResult {
  step: 7 | 8 | 9 | 10
  newStatus: CsaStatus | null // null = no change (current status not in update conditions)
  cancelReasonCode: string | null
  careEndDate: Date | null
}

// Stats returned by the eligibility run
export interface EligibilityRunResult {
  processed: number
  statusChanges: number
  newContacts: number
  stepCounts: {
    step7: number
    step8: number
    step9: number
    step10: number
    noChange: number // outcome step didn't match current status
  }
}
