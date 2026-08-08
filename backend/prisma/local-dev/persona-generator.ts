import {
  CSA_STATUS,
  CSA_STATUS_LABELS,
} from '../../src/common/state-machine/constants/csa-status.constants'

type JsonItem = Record<string, string>

export interface PersonaChain {
  caseItem: JsonItem
  placement: JsonItem
  legalAuthority: JsonItem
  legalAuthorityAdmin: JsonItem
  agreement: JsonItem
  order: JsonItem
  oocAgreementLine: JsonItem
  misPlacement: string[]
  misContract: string[]
  misPayment: string[]
}

export interface PersonaChainOptions {
  csaStatusLabel?: string
  csaSentDate?: string
  csaEffectiveDate?: string
  din?: string
  firstName?: string
  lastName?: string
  middleName?: string
  akaFirstName?: string
  akaLastName?: string
  birthDate?: string
  age?: string
  gender?: string
  birthCity?: string
  officeName?: string
  caseload?: string
  salesRep?: string
}

const FIRST_NAMES = [
  'Aiden',
  'Bella',
  'Carlos',
  'Dina',
  'Evan',
  'Fiona',
  'Grant',
  'Hana',
  'Ivan',
  'Jade',
  'Kai',
  'Luna',
  'Miles',
  'Nora',
  'Owen',
  'Pia',
  'Quinn',
  'Rosa',
  'Sam',
  'Tara',
  'Uma',
  'Vince',
  'Willa',
  'Xander',
  'Yara',
  'Zane',
  'Amir',
  'Bree',
  'Cole',
  'Demi',
  'Ellis',
  'Faith',
  'Gavin',
  'Hope',
  'Iris',
  'Jules',
  'Kira',
  'Leo',
  'Maya',
  'Nico',
  'Olive',
  'Paige',
]

const LAST_NAMES = [
  'Mercer',
  'Chen',
  'Singh',
  'Patel',
  'Brooks',
  'Nguyen',
  'Martinez',
  'Kim',
  'Foster',
  'Reed',
  'Hayes',
  'Dunn',
  'Cole',
  'Ward',
  'Price',
  'Ross',
  'Bell',
  'Gray',
  'Long',
  'Cruz',
  'Park',
  'Wood',
  'West',
  'Stone',
  'Lane',
  'Hart',
  'Shaw',
  'Rose',
  'Ford',
  'Page',
  'Bond',
  'Vega',
  'Wolf',
  'York',
  'King',
  'Hall',
  'Cook',
  'Bell',
  'Moss',
  'Snow',
  'Lake',
  'Marsh',
]

const OFFICES = [
  'DCV - VICTORIA',
  'DCV - SURREY',
  'DCV - VANCOUVER',
  'DCV - KELOWNA',
  'DCV - NANAIMO',
  'DCV - KAMLOOPS',
  'DCV - PRINCE GEORGE',
  'DCV - RICHMOND',
]

const BASELINE_STATUS_LABELS = [
  CSA_STATUS_LABELS[CSA_STATUS.ELIGIBLE_TBD],
  CSA_STATUS_LABELS[CSA_STATUS.ON_HOLD],
  CSA_STATUS_LABELS[CSA_STATUS.NOT_ELIGIBLE_IN_PAY],
  CSA_STATUS_LABELS[CSA_STATUS.NOT_ELIGIBLE_IP_TBD],
  CSA_STATUS_LABELS[CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY],
  CSA_STATUS_LABELS[CSA_STATUS.IN_BATCH_APPLICATION],
  CSA_STATUS_LABELS[CSA_STATUS.BATCH_SENT_APPLICATION],
  CSA_STATUS_LABELS[CSA_STATUS.APPLICATION_REFUSED_CRA],
  CSA_STATUS_LABELS[CSA_STATUS.IN_BATCH_CANCELLATION],
  CSA_STATUS_LABELS[CSA_STATUS.BATCH_SENT_CANCELLATION],
  CSA_STATUS_LABELS[CSA_STATUS.CANCELLATION_REFUSED_CRA],
  CSA_STATUS_LABELS[CSA_STATUS.CRA_ERROR_APPLICATION],
  CSA_STATUS_LABELS[CSA_STATUS.CRA_ERROR_CANCELLATION],
  CSA_STATUS_LABELS[CSA_STATUS.ELIGIBLE],
  CSA_STATUS_LABELS[CSA_STATUS.IN_PAY],
  CSA_STATUS_LABELS[CSA_STATUS.OVER_18],
]

function padIndex(index: number): string {
  return String(index).padStart(6, '0')
}

function defaultBirthDate(index: number): string {
  const year = 2010 + (index % 12)
  const month = String((index % 12) + 1).padStart(2, '0')
  const day = String((index % 28) + 1).padStart(2, '0')
  return `${month}/${day}/${year}`
}

function defaultAge(birthDate: string): string {
  const year = Number(birthDate.slice(6, 10))
  return String(Math.max(5, 2026 - year))
}

export function baselineStatusLabelForIndex(index: number): string {
  if (index < 5) return ''
  return BASELINE_STATUS_LABELS[(index - 5) % BASELINE_STATUS_LABELS.length]
}

export function buildPersonaChain(
  index: number,
  icmTimestamp: string,
  misTimestamp: string,
  options: PersonaChainOptions = {},
): PersonaChain {
  const suffix = padIndex(index)
  const shortSuffix = String(index).padStart(3, '0')
  const caseId = `P-${suffix}`
  const personIcm = `CON-${100000 + index}`
  const personMis = `MIS${shortSuffix}`
  const spId = `SP-${suffix}`
  const contractNumber = `CN-${shortSuffix}`
  const fchContract = `FCH-${shortSuffix}`
  const agreementId = `AG-${shortSuffix}`

  const firstName = options.firstName ?? FIRST_NAMES[index % FIRST_NAMES.length]
  const lastName = options.lastName ?? LAST_NAMES[index % LAST_NAMES.length]
  const birthDate = options.birthDate ?? defaultBirthDate(index)
  const age = options.age ?? defaultAge(birthDate)

  const caseItem: JsonItem = {
    Id: caseId,
    'Updated Date': icmTimestamp,
    'Key Player AKA First Name': options.akaFirstName ?? firstName,
    'Key Player AKA Last Name': options.akaLastName ?? lastName,
    'Key Player Age': age,
    'Key Player Birth City': options.birthCity ?? 'Vancouver',
    'Key Player Birth Date': birthDate,
    'Key Player Birth Province': 'BC',
    'Key Player CSA Sent Date': options.csaSentDate ?? '',
    'Key Player CSA Status': options.csaStatusLabel ?? '',
    'Key Player CSA Status Effective Date': options.csaEffectiveDate ?? '',
    'Key Player DIN': options.din ?? '',
    'Key Player Last Updated Date': icmTimestamp,
    'Key Player M/F': options.gender ?? (index % 2 === 0 ? 'Man/Boy' : 'Woman/Girl'),
    'Key Player Place of Birth': 'Canada',
    'Key Player Id': caseId,
    'Key Player Contact Row Num': personIcm,
    'Case Num': `1-9${String(index).padStart(10, '0')}`,
    'Legacy File Number': `CS9${String(index).padStart(7, '0')}`,
    Type: 'Child Services',
    Status: 'Open',
    Caseload: options.caseload ?? `${100 + index}`,
    'Office Name': options.officeName ?? OFFICES[index % OFFICES.length],
    'Sales Rep': options.salesRep ?? `WORKER${shortSuffix}`,
    'Subject Contact Last Name': lastName,
    'Middle Name': options.middleName ?? '',
    'Subject Contact First Name': firstName,
    'Admn First Name': 'Alex',
    'Admn Last Name': 'Admin',
    Deceased: 'N',
    'Key Player Integration Id': personMis,
  }

  return {
    caseItem,
    placement: {
      Id: `PL-${shortSuffix}`,
      Updated: icmTimestamp,
      'Placement Number': `1-9${String(index).padStart(9, '0')}`,
      Type: 'Placement',
      'Service Type': 'FCH Level 2',
      Status: 'Active',
      'Start Date': '01/15/2026 09:00:00',
      'End Date': '',
      'Place of Service': `${lastName} Foster Home`,
      'Paid/Unpaid?': 'Paid',
      'Service Provider': `${lastName} Provider`,
      'Service Provider Id': spId,
      'MCFD Contract Number': fchContract,
      'Interrupted Placement #': '',
      'Case Id': caseId,
      'Agreement Id': agreementId,
    },
    legalAuthority: {
      Id: `LEG-${shortSuffix}`,
      Updated: icmTimestamp,
      'Legal Authority Code': 'CCO-CCO-49(1)',
      'Effective Legal Status': 'CCO-CCO-49(1)',
      'Effective Date': '01/01/2026',
      'Expiry Date': '12/31/2027',
      'Parent Contact Id': caseId,
    },
    legalAuthorityAdmin: {
      Id: `LA-${shortSuffix}`,
      Updated: icmTimestamp,
      'Legal Auth Code': 'CCO-CCO-49(1)',
      'MIS Legal Auth Code': 'SNP',
      'Enroll for CSA': 'Yes',
    },
    agreement: {
      Id: agreementId,
      Updated: icmTimestamp,
      'Service Provider': `${lastName} Provider`,
      'Service Provider Id': spId,
      'ICM PCMS Contract Number': fchContract,
      'Agreement Status': 'Active',
      'Agreement Start Date': '01/01/2026 09:00:00',
      'Agreement End Date': '12/31/2027 23:59:59',
      'Agreement Type': 'FCH',
      'ICM Termination Date': '',
    },
    order: {
      Id: `OR-${shortSuffix}`,
      'Order Updated': icmTimestamp,
      'Order Number': `ORD-9${String(index).padStart(7, '0')}`,
      'Order Type': 'Monthly Family Care Rate',
      'Order Status': 'Closed',
      'Order Amount': `${(2000 + (index % 20) * 100).toFixed(2)}`,
      'Order Effective Start Date': '01/01/2026',
      Product: 'Monthly Family Care Rate',
      'MCFD Contract Num': fchContract,
      'Agreement Id': agreementId,
    },
    oocAgreementLine: {
      Id: `OOC-${shortSuffix}`,
      Updated: icmTimestamp,
      'Agreement Id': `AGR-OOC-${shortSuffix}`,
      'ICM Person ID': personIcm,
    },
    misPlacement: [
      `PLC${shortSuffix}`,
      misTimestamp,
      `LOC${shortSuffix}`,
      'PL',
      'Foster Care',
      'Active',
      '2026-01-01',
      '',
      `${lastName} Foster Home`,
      `${lastName} Provider`,
      spId,
      contractNumber,
      `CS9${String(index).padStart(7, '0')}`,
      personMis,
    ],
    misContract: [
      `CT${shortSuffix}`,
      misTimestamp,
      spId,
      `${lastName} Provider`,
      contractNumber,
      'Active',
      '2026-01-01',
      '2027-12-31',
      'FCH',
      '',
    ],
    misPayment: [
      `PM${shortSuffix}`,
      misTimestamp,
      `9${String(index).padStart(5, '0')}`,
      'MAINTENANCE PAYMENT',
      'Processed',
      `${(2000 + (index % 20) * 100).toFixed(2)}`,
      '2026-01-01',
      '2026-12-31',
      contractNumber,
      'Paid',
      personMis,
    ],
  }
}

export function appendPersonaChain(
  chain: PersonaChain,
  target: {
    placements: JsonItem[]
    legalAuthorities: JsonItem[]
    legalAuthorityAdmins: JsonItem[]
    agreements: JsonItem[]
    orders: JsonItem[]
    oocAgreementLines: JsonItem[]
    misPlacements: string[][]
    misContracts: string[][]
    misPayments: string[][]
  },
): void {
  target.placements.push(chain.placement)
  target.legalAuthorities.push(chain.legalAuthority)
  target.legalAuthorityAdmins.push(chain.legalAuthorityAdmin)
  target.agreements.push(chain.agreement)
  target.orders.push(chain.order)
  target.oocAgreementLines.push(chain.oocAgreementLine)
  target.misPlacements.push(chain.misPlacement)
  target.misContracts.push(chain.misContract)
  target.misPayments.push(chain.misPayment)
}
