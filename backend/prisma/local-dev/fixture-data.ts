import {
  BASELINE_CASE_COUNT,
  BASELINE_ICM_TIMESTAMP,
  BASELINE_MIS_TIMESTAMP,
  INCREMENTAL_CASE_COUNT,
  INCREMENTAL_ICM_TIMESTAMP,
  INCREMENTAL_MIS_TIMESTAMP,
} from './constants'
import {
  appendPersonaChain,
  baselineStatusLabelForIndex,
  buildPersonaChain,
} from './persona-generator'

type JsonItem = Record<string, string>

export interface LocalDevFixtures {
  icm: Record<string, JsonItem[]>
  mis: Record<string, string[][]>
}

const BASELINE_CASES: JsonItem[] = [
  {
    Id: 'P-000000',
    'Updated Date': BASELINE_ICM_TIMESTAMP,
    'Key Player AKA First Name': 'Jennie',
    'Key Player AKA Last Name': 'Conn',
    'Key Player Age': '12',
    'Key Player Birth City': 'Victoria',
    'Key Player Birth Date': '04/12/2014',
    'Key Player Birth Province': 'BC',
    'Key Player CSA Sent Date': '10/17/2025 13:52:52',
    'Key Player CSA Status': 'Eligible',
    'Key Player CSA Status Effective Date': '02/22/2025',
    'Key Player DIN': '',
    'Key Player Last Updated Date': BASELINE_ICM_TIMESTAMP,
    'Key Player M/F': 'Woman/Girl',
    'Key Player Place of Birth': 'Canada',
    'Key Player Id': 'P-000000',
    'Key Player Contact Row Num': 'CON-100000',
    'Case Num': '1-35519798590',
    'Legacy File Number': 'CS10332832',
    Type: 'Child Services',
    Status: 'Open',
    Caseload: '588',
    'Office Name': 'DCV - VICTORIA',
    'Sales Rep': 'WORKER710',
    'Subject Contact Last Name': 'Larkin',
    'Middle Name': '',
    'Subject Contact First Name': 'Johanna',
    'Admn First Name': 'Lester',
    'Admn Last Name': 'White',
    Deceased: 'N',
    'Key Player Integration Id': '2VLP0YT766',
  },
  {
    Id: 'P-000001',
    'Updated Date': BASELINE_ICM_TIMESTAMP,
    'Key Player AKA First Name': 'Myrtle',
    'Key Player AKA Last Name': 'Kozey',
    'Key Player Age': '5',
    'Key Player Birth City': 'Surrey',
    'Key Player Birth Date': '07/21/2020',
    'Key Player Birth Province': 'BC',
    'Key Player CSA Sent Date': '11/12/2025 13:37:39',
    'Key Player CSA Status': 'Eligible',
    'Key Player CSA Status Effective Date': '04/09/2025',
    'Key Player DIN': '',
    'Key Player Last Updated Date': BASELINE_ICM_TIMESTAMP,
    'Key Player M/F': 'Woman/Girl',
    'Key Player Place of Birth': 'Canada',
    'Key Player Id': 'P-000001',
    'Key Player Contact Row Num': 'CON-100001',
    'Case Num': '1-88185883124',
    'Legacy File Number': 'CS88054213',
    Type: 'Child Services',
    Status: 'Open',
    Caseload: '948',
    'Office Name': 'DCV - SURREY',
    'Sales Rep': 'WORKER399',
    'Subject Contact Last Name': 'Kunde',
    'Middle Name': 'Ebony',
    'Subject Contact First Name': 'Noemie',
    'Admn First Name': 'Alfonso',
    'Admn Last Name': 'Nienow',
    Deceased: 'N',
    'Key Player Integration Id': 'PQR2C4VMB2',
  },
  {
    Id: 'P-000002',
    'Updated Date': BASELINE_ICM_TIMESTAMP,
    'Key Player AKA First Name': 'Nola',
    'Key Player AKA Last Name': 'Hilll',
    'Key Player Age': '7',
    'Key Player Birth City': 'Kelowna',
    'Key Player Birth Date': '04/15/2018',
    'Key Player Birth Province': 'BC',
    'Key Player CSA Sent Date': '01/17/2026 16:45:15',
    'Key Player CSA Status': 'In Pay',
    'Key Player CSA Status Effective Date': '01/13/2026',
    'Key Player DIN': '123456789',
    'Key Player Last Updated Date': BASELINE_ICM_TIMESTAMP,
    'Key Player M/F': 'Man/Boy',
    'Key Player Place of Birth': 'Canada',
    'Key Player Id': 'P-000002',
    'Key Player Contact Row Num': 'CON-100002',
    'Case Num': '1-85520896337',
    'Legacy File Number': 'CS88760186',
    Type: 'Child Services',
    Status: 'Open',
    Caseload: '108',
    'Office Name': 'DCV - KELOWNA',
    'Sales Rep': 'WORKER566',
    'Subject Contact Last Name': 'Hammes',
    'Middle Name': 'Gus',
    'Subject Contact First Name': 'Kailey',
    'Admn First Name': 'Lorena',
    'Admn Last Name': 'Langworth',
    Deceased: 'N',
    'Key Player Integration Id': '1LI1AW85HZ',
  },
  {
    Id: 'P-000003',
    'Updated Date': BASELINE_ICM_TIMESTAMP,
    'Key Player AKA First Name': 'Kristie',
    'Key Player AKA Last Name': 'Reinger',
    'Key Player Age': '15',
    'Key Player Birth City': 'Nanaimo',
    'Key Player Birth Date': '10/06/2010',
    'Key Player Birth Province': 'BC',
    'Key Player CSA Sent Date': '',
    'Key Player CSA Status': 'Over 18',
    'Key Player CSA Status Effective Date': '',
    'Key Player DIN': '642370100',
    'Key Player Last Updated Date': BASELINE_ICM_TIMESTAMP,
    'Key Player M/F': 'Woman/Girl',
    'Key Player Place of Birth': 'Canada',
    'Key Player Id': 'P-000003',
    'Key Player Contact Row Num': 'CON-100003',
    'Case Num': '1-40441436603',
    'Legacy File Number': 'CS65861060',
    Type: 'Child Services',
    Status: 'Open',
    Caseload: '627',
    'Office Name': 'DCV - NANAIMO',
    'Sales Rep': 'WORKER364',
    'Subject Contact Last Name': 'Kessler',
    'Middle Name': '',
    'Subject Contact First Name': 'Ernesto',
    'Admn First Name': 'Verna',
    'Admn Last Name': 'Jast',
    Deceased: 'N',
    'Key Player Integration Id': 'L11TC4IR7M',
  },
  {
    Id: 'P-000004',
    'Updated Date': BASELINE_ICM_TIMESTAMP,
    'Key Player AKA First Name': 'Bernard',
    'Key Player AKA Last Name': 'Kassulke',
    'Key Player Age': '15',
    'Key Player Birth City': 'Kamloops',
    'Key Player Birth Date': '10/06/2010',
    'Key Player Birth Province': 'BC',
    'Key Player CSA Sent Date': '',
    'Key Player CSA Status': 'Over 18',
    'Key Player CSA Status Effective Date': '01/01/2026',
    'Key Player DIN': '905956646',
    'Key Player Last Updated Date': BASELINE_ICM_TIMESTAMP,
    'Key Player M/F': 'Woman/Girl',
    'Key Player Place of Birth': 'Canada',
    'Key Player Id': 'P-000004',
    'Key Player Contact Row Num': 'CON-100004',
    'Case Num': '1-02984621435',
    'Legacy File Number': 'CS09965386',
    Type: 'Child Services',
    Status: 'Open',
    Caseload: '246',
    'Office Name': 'DCV - KAMLOOPS',
    'Sales Rep': 'WORKER976',
    'Subject Contact Last Name': 'Bednar',
    'Middle Name': '',
    'Subject Contact First Name': 'Jerome',
    'Admn First Name': 'Maria',
    'Admn Last Name': 'Windler',
    Deceased: 'N',
    'Key Player Integration Id': 'TP23ZDDTYZ',
  },
]

function buildBaselineCases(): JsonItem[] {
  const generatedCases: JsonItem[] = []

  for (let index = 5; index < BASELINE_CASE_COUNT; index++) {
    generatedCases.push(
      buildPersonaChain(index, BASELINE_ICM_TIMESTAMP, BASELINE_MIS_TIMESTAMP, {
        csaStatusLabel: baselineStatusLabelForIndex(index),
        csaEffectiveDate: '02/01/2026',
      }).caseItem,
    )
  }

  return [...BASELINE_CASES, ...generatedCases]
}

function buildGeneratedBaselineRelatedRecords() {
  const placements: JsonItem[] = []
  const legalAuthorities: JsonItem[] = []
  const legalAuthorityAdmins: JsonItem[] = []
  const agreements: JsonItem[] = []
  const orders: JsonItem[] = []
  const oocAgreementLines: JsonItem[] = []
  const misPlacements: string[][] = []
  const misContracts: string[][] = []
  const misPayments: string[][] = []

  const target = {
    placements,
    legalAuthorities,
    legalAuthorityAdmins,
    agreements,
    orders,
    oocAgreementLines,
    misPlacements,
    misContracts,
    misPayments,
  }

  for (let index = 5; index < BASELINE_CASE_COUNT; index++) {
    appendPersonaChain(
      buildPersonaChain(index, BASELINE_ICM_TIMESTAMP, BASELINE_MIS_TIMESTAMP, {
        csaStatusLabel: baselineStatusLabelForIndex(index),
        csaEffectiveDate: '02/01/2026',
      }),
      target,
    )
  }

  return target
}

function buildBaselineRelatedRecords() {
  const placements: JsonItem[] = []
  const legalAuthorities: JsonItem[] = []
  const legalAuthorityAdmins: JsonItem[] = []
  const agreements: JsonItem[] = []
  const orders: JsonItem[] = []
  const misPlacements: string[][] = []
  const misContracts: string[][] = []
  const misPayments: string[][] = []

  // Baseline related records for existing in-app contacts (P-000002..004)
  placements.push(
    {
      Id: 'PL-000002',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Placement Number': '1-50322938675',
      Type: 'Placement',
      'Service Type': 'FCH Level 3',
      Status: 'Active',
      'Start Date': '04/22/2025 02:19:42',
      'End Date': '',
      'Place of Service': 'Kelowna Foster Home',
      'Paid/Unpaid?': 'Paid',
      'Service Provider': 'Weimann - Wilkinson',
      'Service Provider Id': 'SP-000002',
      'MCFD Contract Number': 'FCH-000002',
      'Interrupted Placement #': '',
      'Case Id': 'P-000002',
      'Agreement Id': 'AG-000002',
    },
    {
      Id: 'PL-000003',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Placement Number': '1-10100603808',
      Type: 'Placement',
      'Service Type': 'FCH Level 2',
      Status: 'Active',
      'Start Date': '10/22/2025 03:25:02',
      'End Date': '',
      'Place of Service': 'Nanaimo Foster Home',
      'Paid/Unpaid?': 'Paid',
      'Service Provider': 'Grady, Dare and Rolfson',
      'Service Provider Id': 'SP-000003',
      'MCFD Contract Number': 'FCH-000003',
      'Interrupted Placement #': '',
      'Case Id': 'P-000003',
      'Agreement Id': 'AG-000003',
    },
    {
      Id: 'PL-000004',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Placement Number': '1-38915398844',
      Type: 'Placement',
      'Service Type': 'FCH Level 2',
      Status: 'Active',
      'Start Date': '12/22/2025 09:58:03',
      'End Date': '',
      'Place of Service': 'Kamloops Foster Home',
      'Paid/Unpaid?': 'Paid',
      'Service Provider': 'Welch, Stanton and Franecki',
      'Service Provider Id': 'SP-000004',
      'MCFD Contract Number': 'FCH-000004',
      'Interrupted Placement #': '',
      'Case Id': 'P-000004',
      'Agreement Id': 'AG-000004',
    },
  )

  legalAuthorities.push(
    {
      Id: 'LEG-000002',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Legal Authority Code': 'CCO-CCO-49(1)',
      'Effective Legal Status': 'CCO-CCO-49(1)',
      'Effective Date': '06/04/2025',
      'Expiry Date': '05/30/2027',
      'Parent Contact Id': 'P-000002',
    },
    {
      Id: 'LEG-000003',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Legal Authority Code': 'CCO-CCO-49(1)',
      'Effective Legal Status': 'CCO-CCO-49(1)',
      'Effective Date': '12/02/2025',
      'Expiry Date': '11/18/2026',
      'Parent Contact Id': 'P-000003',
    },
    {
      Id: 'LEG-000004',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Legal Authority Code': 'CCO-CCO-49(1)',
      'Effective Legal Status': 'CCO-CCO-49(1)',
      'Effective Date': '03/01/2024',
      'Expiry Date': '11/04/2027',
      'Parent Contact Id': 'P-000004',
    },
  )

  legalAuthorityAdmins.push(
    {
      Id: 'LA-000002',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Legal Auth Code': 'CCO-CCO-49(1)',
      'MIS Legal Auth Code': 'SNP',
      'Enroll for CSA': 'Yes',
    },
    {
      Id: 'LA-000003',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Legal Auth Code': 'CCO-CCO-49(1)',
      'MIS Legal Auth Code': 'SNP',
      'Enroll for CSA': 'Yes',
    },
    {
      Id: 'LA-000004',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Legal Auth Code': 'CCO-CCO-49(1)',
      'MIS Legal Auth Code': 'SNP',
      'Enroll for CSA': 'Yes',
    },
  )

  agreements.push(
    {
      Id: 'AG-000002',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Service Provider': 'Weimann - Wilkinson',
      'Service Provider Id': 'SP-000002',
      'ICM PCMS Contract Number': 'FCH-000002',
      'Agreement Status': 'Active',
      'Agreement Start Date': '04/22/2025 02:19:42',
      'Agreement End Date': '04/22/2027 02:19:42',
      'Agreement Type': 'FCH',
      'ICM Termination Date': '',
    },
    {
      Id: 'AG-000003',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Service Provider': 'Grady, Dare and Rolfson',
      'Service Provider Id': 'SP-000003',
      'ICM PCMS Contract Number': 'FCH-000003',
      'Agreement Status': 'Active',
      'Agreement Start Date': '10/22/2025 03:25:02',
      'Agreement End Date': '10/22/2027 03:25:02',
      'Agreement Type': 'FCH',
      'ICM Termination Date': '',
    },
    {
      Id: 'AG-000004',
      Updated: BASELINE_ICM_TIMESTAMP,
      'Service Provider': 'Welch, Stanton and Franecki',
      'Service Provider Id': 'SP-000004',
      'ICM PCMS Contract Number': 'FCH-000004',
      'Agreement Status': 'Active',
      'Agreement Start Date': '12/22/2025 09:58:03',
      'Agreement End Date': '12/22/2027 09:58:03',
      'Agreement Type': 'FCH',
      'ICM Termination Date': '',
    },
  )

  orders.push(
    {
      Id: 'OR-000002',
      'Order Updated': BASELINE_ICM_TIMESTAMP,
      'Order Number': 'ORD-83159650',
      'Order Type': 'Monthly Family Care Rate',
      'Order Status': 'Closed',
      'Order Amount': '4034.00',
      'Order Effective Start Date': '01/09/2026',
      Product: 'Monthly Family Care Rate',
      'MCFD Contract Num': 'FCH-000002',
      'Agreement Id': 'AG-000002',
    },
    {
      Id: 'OR-000003',
      'Order Updated': BASELINE_ICM_TIMESTAMP,
      'Order Number': 'ORD-71958383',
      'Order Type': 'Monthly Family Care Rate',
      'Order Status': 'Closed',
      'Order Amount': '1175.70',
      'Order Effective Start Date': '01/13/2026',
      Product: 'Monthly Family Care Rate',
      'MCFD Contract Num': 'FCH-000003',
      'Agreement Id': 'AG-000003',
    },
    {
      Id: 'OR-000004',
      'Order Updated': BASELINE_ICM_TIMESTAMP,
      'Order Number': 'ORD-57585584',
      'Order Type': 'Monthly Family Care Rate',
      'Order Status': 'Closed',
      'Order Amount': '5881.71',
      'Order Effective Start Date': '01/21/2025',
      Product: 'Monthly Family Care Rate',
      'MCFD Contract Num': 'FCH-000004',
      'Agreement Id': 'AG-000004',
    },
  )

  misPlacements.push(
    [
      'PLC000002',
      BASELINE_MIS_TIMESTAMP,
      'LOC8895',
      'PL',
      'Foster Care',
      'Active',
      '2025-11-28',
      '',
      'Kelowna Foster Home',
      'Weimann - Wilkinson',
      'SP-000002',
      'CN-000002',
      'CS88760186',
      '1LI1AW85HZ',
    ],
    [
      'PLC000003',
      BASELINE_MIS_TIMESTAMP,
      'LOC6777',
      'PL',
      'Foster Care',
      'Active',
      '2025-08-09',
      '',
      'Nanaimo Foster Home',
      'Grady, Dare and Rolfson',
      'SP-000003',
      'CN-000003',
      'CS65861060',
      'L11TC4IR7M',
    ],
    [
      'PLC000004',
      BASELINE_MIS_TIMESTAMP,
      'LOC4935',
      'PL',
      'Foster Care',
      'Active',
      '2025-07-04',
      '',
      'Kamloops Foster Home',
      'Welch, Stanton and Franecki',
      'SP-000004',
      'CN-000004',
      'CS09965386',
      'TP23ZDDTYZ',
    ],
  )

  misContracts.push(
    [
      'CT000002',
      BASELINE_MIS_TIMESTAMP,
      'SP-000002',
      'Weimann - Wilkinson',
      'CN-000002',
      'Active',
      '2025-03-13',
      '2026-05-25',
      'FCH',
      '',
    ],
    [
      'CT000003',
      BASELINE_MIS_TIMESTAMP,
      'SP-000003',
      'Grady, Dare and Rolfson',
      'CN-000003',
      'Active',
      '2025-07-06',
      '2026-03-08',
      'FCH',
      '',
    ],
    [
      'CT000004',
      BASELINE_MIS_TIMESTAMP,
      'SP-000004',
      'Welch, Stanton and Franecki',
      'CN-000004',
      'Active',
      '2025-02-04',
      '2026-06-09',
      'FCH',
      '',
    ],
  )

  misPayments.push(
    [
      'PM000002',
      BASELINE_MIS_TIMESTAMP,
      '691587',
      'MAINTENANCE PAYMENT',
      'Processed',
      '2117.71',
      '2026-01-09',
      '2026-02-22',
      'CN-000002',
      'Paid',
      '1LI1AW85HZ',
    ],
    [
      'PM000003',
      BASELINE_MIS_TIMESTAMP,
      '090399',
      'MAINTENANCE PAYMENT',
      'Processed',
      '2518.00',
      '2026-01-09',
      '2026-02-09',
      'CN-000003',
      'Paid',
      'L11TC4IR7M',
    ],
    [
      'PM000004',
      BASELINE_MIS_TIMESTAMP,
      '107672',
      'MONTHLY FAMILY CARE RATE',
      'Processed',
      '2077.64',
      '2026-01-18',
      '2026-02-11',
      'CN-000004',
      'Paid',
      'TP23ZDDTYZ',
    ],
  )

  return {
    placements,
    legalAuthorities,
    legalAuthorityAdmins,
    agreements,
    orders,
    oocAgreementLines: [
      {
        Id: 'OOC-000002',
        Updated: BASELINE_ICM_TIMESTAMP,
        'Agreement Id': 'AGR-OOC-002',
        'ICM Person ID': 'CON-100002',
      },
    ],
    misPlacements,
    misContracts,
    misPayments,
  }
}

function mergeRelatedRecords(
  manual: ReturnType<typeof buildBaselineRelatedRecords>,
  generated: ReturnType<typeof buildGeneratedBaselineRelatedRecords>,
) {
  return {
    placements: [...manual.placements, ...generated.placements],
    legalAuthorities: [...manual.legalAuthorities, ...generated.legalAuthorities],
    legalAuthorityAdmins: [...manual.legalAuthorityAdmins, ...generated.legalAuthorityAdmins],
    agreements: [...manual.agreements, ...generated.agreements],
    orders: [...manual.orders, ...generated.orders],
    oocAgreementLines: [...manual.oocAgreementLines, ...generated.oocAgreementLines],
    misPlacements: [...manual.misPlacements, ...generated.misPlacements],
    misContracts: [...manual.misContracts, ...generated.misContracts],
    misPayments: [...manual.misPayments, ...generated.misPayments],
  }
}

function buildIncrementalRecords() {
  const cases: JsonItem[] = []
  const placements: JsonItem[] = []
  const legalAuthorities: JsonItem[] = []
  const legalAuthorityAdmins: JsonItem[] = []
  const agreements: JsonItem[] = []
  const orders: JsonItem[] = []
  const oocAgreementLines: JsonItem[] = []
  const misPlacements: string[][] = []
  const misContracts: string[][] = []
  const misPayments: string[][] = []

  const target = {
    placements,
    legalAuthorities,
    legalAuthorityAdmins,
    agreements,
    orders,
    oocAgreementLines,
    misPlacements,
    misContracts,
    misPayments,
  }

  for (let i = 0; i < INCREMENTAL_CASE_COUNT; i++) {
    const index = BASELINE_CASE_COUNT + i
    const chain = buildPersonaChain(index, INCREMENTAL_ICM_TIMESTAMP, INCREMENTAL_MIS_TIMESTAMP)
    cases.push(chain.caseItem)
    appendPersonaChain(chain, target)
  }

  return {
    cases,
    placements,
    legalAuthorities,
    legalAuthorityAdmins,
    agreements,
    orders,
    oocAgreementLines,
    misPlacements,
    misContracts,
    misPayments,
  }
}

function assembleFixtures(includeIncremental: boolean): LocalDevFixtures {
  const baselineCases = buildBaselineCases()
  const manualRelated = buildBaselineRelatedRecords()
  const generatedRelated = buildGeneratedBaselineRelatedRecords()
  const baselineRelated = mergeRelatedRecords(manualRelated, generatedRelated)
  const incremental = includeIncremental ? buildIncrementalRecords() : null

  return {
    icm: {
      cases: [...baselineCases, ...(incremental?.cases ?? [])],
      placements: [...baselineRelated.placements, ...(incremental?.placements ?? [])],
      legal_authority: [
        ...baselineRelated.legalAuthorities,
        ...(incremental?.legalAuthorities ?? []),
      ],
      legal_authority_admin: [
        ...baselineRelated.legalAuthorityAdmins,
        ...(incremental?.legalAuthorityAdmins ?? []),
      ],
      agreements: [...baselineRelated.agreements, ...(incremental?.agreements ?? [])],
      orders: [...baselineRelated.orders, ...(incremental?.orders ?? [])],
      ooc_agreement_lines: [
        ...baselineRelated.oocAgreementLines,
        ...(incremental?.oocAgreementLines ?? []),
      ],
    },
    mis: {
      rap_placements: [
        [
          'ID',
          'LAST_UPDATED_DATE',
          'PLACEMENT_LOCATION_NO',
          'TYPE',
          'SUB_TYPE',
          'STATUS',
          'START_DATE',
          'END_DATE',
          'PLACE_OF_SERVICE_NAME',
          'SERVICE_PROVIDER_NAME',
          'SERVICE_PROVIDER_ID',
          'CONTRACT_NUMBER',
          'LEGACY_FILE_NUMBER',
          'PERSON_ID_MIS',
        ],
        ...baselineRelated.misPlacements,
        ...(incremental?.misPlacements ?? []),
      ],
      rap_contracts: [
        [
          'ID',
          'LAST_UPDATED_DATE',
          'SERVICE_PROVIDER_ID',
          'SERVICE_PROVIDER_NAME',
          'CONTRACT_NUMBER',
          'STATUS',
          'CONTRACT_START_DATE',
          'CONTRACT_END_DATE',
          'CONTRACT_TYPE',
          'TERMINATION_DATE',
        ],
        ...baselineRelated.misContracts,
        ...(incremental?.misContracts ?? []),
      ],
      rap_payments: [
        [
          'ID',
          'LAST_UPDATED_DATE',
          'PAYMENT_NUMBER',
          'PAYMENT_TYPE',
          'PAYMENT_STATUS',
          'PAYMENT_AMOUNT',
          'PAYMENT_EFFECTIVE_START_DATE',
          'PAYMENT_EFFECTIVE_END_DATE',
          'CONTRACT_NUMBER',
          'PAYMENT_UPDATED',
          'PERSON_ID_MIS',
        ],
        ...baselineRelated.misPayments,
        ...(incremental?.misPayments ?? []),
      ],
    },
  }
}

export function getBaselineFixtures(): LocalDevFixtures {
  return assembleFixtures(false)
}

export function getFullFixtures(): LocalDevFixtures {
  return assembleFixtures(true)
}

export function getBaselineCases(): JsonItem[] {
  return buildBaselineCases()
}
