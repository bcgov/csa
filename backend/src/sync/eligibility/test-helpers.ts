import { AgreementRecord, ContactProfile, OrderRecord, PlacementRecord } from './eligibility.types'

export function makeContact(overrides: Partial<ContactProfile> = {}): ContactProfile {
  return {
    caseRowId: 'CASE-1',
    contactIdIcm: null,
    personIdIcm: 'ICM-1',
    personIdMis: 'MIS-1',
    firstName: 'John',
    lastName: 'Doe',
    middleName: '',
    dateOfBirth: new Date('2010-01-15'),
    age: 16,
    gender: 'M',
    caseNumber: 'CS-001',
    caseType: 'Child Services',
    caseStatus: 'Open',
    caseLoad: 'CL-1',
    legacyFileNumber: null,
    serviceOffice: null,
    assignedTo: null,
    csaStatus: null,
    csaStatusEffectiveDate: null,
    lastEligibilityEvaluatedAt: null,
    existingContactId: null,
    lastUpdatedBy: null,
    din: null,
    csaSentDate: null,
    misLegalAuthCode: null,
    enrollForCsa: null,
    legalExpiryDate: null,
    effectiveLegalStatus: null,
    legalAuthorityCode: null,
    effectiveDate: null,
    birthCity: null,
    birthProvince: null,
    birthCountry: null,
    akaFirstName: null,
    akaLastName: null,
    prevRecipientFirstName: null,
    prevRecipientLastName: null,
    isIneligible: false,
    deceased: null,
    cancelReasonCode: null,
    careEndDate: null,
    placements: [],
    orders: [],
    agreements: [],
    ...overrides,
  }
}

export function makePlacement(overrides: Partial<PlacementRecord> = {}): PlacementRecord {
  return {
    type: 'Placement',
    rawType: 'Placement',
    status: 'Active',
    startDate: null,
    endDate: null,
    contractNumber: null,
    agreementRowId: null,
    paidUnpaid: null,
    source: 'ICM',
    ...overrides,
  }
}

export function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    orderType: 'Monthly Family Care Rate',
    orderStatus: 'Closed',
    effectiveStartDate: null,
    effectiveEndDate: null,
    amount: 2000,
    contractNumber: null,
    source: 'MIS',
    ...overrides,
  }
}

export function makeAgreement(overrides: Partial<AgreementRecord> = {}): AgreementRecord {
  return {
    rowId: null,
    contractNumber: null,
    agreementType: 'SHSS',
    agreementStatus: 'Active',
    agreementStartDate: new Date('2025-01-01'),
    agreementEndDate: null,
    terminationDate: null,
    mcfdContract: null,
    source: 'ICM',
    ...overrides,
  }
}
