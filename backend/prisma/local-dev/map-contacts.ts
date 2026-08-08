import { CSA_STATUS_LABELS } from '../../src/common/state-machine/constants/csa-status.constants'
import { BASELINE_JOB_COMPLETED_AT } from './constants'

type CaseItem = Record<string, string>

const LABEL_TO_STATUS = Object.fromEntries(
  Object.entries(CSA_STATUS_LABELS).map(([code, label]) => [label, code]),
)

function parseIcmDate(value: string | undefined): Date | null {
  if (!value?.trim()) return null
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/)
  if (!match) return null
  const [, month, day, year, hours = '0', minutes = '0', seconds = '0'] = match
  return new Date(+year, +month - 1, +day, +hours, +minutes, +seconds)
}

function mapCsaStatus(label: string | undefined): string | null {
  if (!label?.trim()) return null
  return LABEL_TO_STATUS[label] ?? null
}

export function mapCaseToContact(caseItem: CaseItem, now: Date) {
  const birthDate = parseIcmDate(caseItem['Key Player Birth Date'])
  const age = caseItem['Key Player Age'] ? parseInt(caseItem['Key Player Age'], 10) : null

  return {
    lastName: caseItem['Subject Contact Last Name'] || 'Unknown',
    firstName: caseItem['Subject Contact First Name'] || 'Unknown',
    middleName: caseItem['Middle Name'] || '',
    akaLastName:
      caseItem['Key Player AKA Last Name'] || caseItem['Subject Contact Last Name'] || '',
    akaFirstName:
      caseItem['Key Player AKA First Name'] || caseItem['Subject Contact First Name'] || '',
    personIdIcm: caseItem['Key Player Contact Row Num'],
    contactIdIcm: caseItem['Key Player Id'] || null,
    personIdMis: caseItem['Key Player Integration Id'] || 'UNKNOWN',
    caseNumber: caseItem['Case Num'],
    legacyFileNumber: caseItem['Legacy File Number'] || null,
    caseType: caseItem.Type || 'Child Services',
    caseStatus: caseItem.Status || 'Open',
    caseLoad: caseItem.Caseload || '',
    serviceOffice: caseItem['Office Name'] || null,
    assignedTo: caseItem['Sales Rep'] || null,
    gender: caseItem['Key Player M/F'] || null,
    dateOfBirth: birthDate,
    age: Number.isNaN(age) ? null : age,
    csaStatus: mapCsaStatus(caseItem['Key Player CSA Status']),
    csaStatusEffectiveDate: parseIcmDate(caseItem['Key Player CSA Status Effective Date']),
    csaSentDate: parseIcmDate(caseItem['Key Player CSA Sent Date']),
    din: caseItem['Key Player DIN']?.trim() || null,
    birthCity: caseItem['Key Player Birth City'] || null,
    birthProvince: caseItem['Key Player Birth Province'] || null,
    birthCountry: caseItem['Key Player Place of Birth'] || null,
    sourceOrder: 'ICM',
    icmIntegrationStatus: false,
    lastEligibilityRunAt: BASELINE_JOB_COMPLETED_AT,
    createdAt: now,
    createdBy: 'seed',
    lastUpdatedAt: now,
    lastUpdatedBy: 'SYSTEM',
  }
}

export function mapCasesToContacts(cases: CaseItem[]): ReturnType<typeof mapCaseToContact>[] {
  const now = new Date()
  return cases.map((caseItem) => mapCaseToContact(caseItem, now))
}
