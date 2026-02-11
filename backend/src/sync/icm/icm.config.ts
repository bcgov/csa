import {
  FieldMapEntry,
  STG_ICM_CASES_MAP,
  STG_ICM_CONTACTS_MAP,
  STG_ICM_PLACEMENTS_MAP,
  STG_LEGAL_ADMIN_MAP,
  STG_LEGAL_AUTHORITY_MAP,
  STG_AGREEMENT_MAP,
  STG_ORDER_MAP,
} from './field-maps'

export interface IcmApiConfig {
  name: string
  endpoint: string
  stagingTable: string
  primaryKey: string
  cursorLabel: string
  searchSpec?: () => string
  fieldMap: FieldMapEntry[]
}

// Date helpers for dynamic search specs

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

function formatDateTime(date: Date): string {
  return `${formatDate(date)} 00:00:00`
}

function today(): string {
  return formatDate(new Date())
}

function eighteenYearsAgo(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  return formatDate(d)
}

function firstDayOfPreviousMonth(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  d.setDate(1)
  return formatDateTime(d)
}

// NOTE: The endpoint paths are placeholders.
// Update with actual ICM API endpoint paths before production use.

/** Configs for ingesting ICM data into staging tables */
export const ICM_INGESTION_CONFIGS: IcmApiConfig[] = [
  {
    name: 'cases',
    endpoint: '/data/Case',
    stagingTable: 'stg_icm_cases',
    primaryKey: 'ROW_ID',
    cursorLabel: 'Key Player Last Updated Date',
    searchSpec: () =>
      `[Type] = "Child Services" AND [Key Player Birth Date] >= "${eighteenYearsAgo()}"`,
    fieldMap: STG_ICM_CASES_MAP,
  },
  {
    name: 'placements',
    endpoint: '/data/Placement',
    stagingTable: 'stg_icm_placements',
    primaryKey: 'ROW_ID',
    cursorLabel: 'Updated',
    searchSpec: () =>
      `([Status] = "Active" OR [Status] = "Interrupted" OR [Status] = "Ended") AND [End Date] >= "${today()}"`,
    fieldMap: STG_ICM_PLACEMENTS_MAP,
  },
  {
    name: 'legal_authority_admin',
    endpoint: '/data/LegalAuthorityAdmin',
    stagingTable: 'stg_icm_legal_authority_admin',
    primaryKey: 'ROW_ID',
    cursorLabel: 'Updated',
    fieldMap: STG_LEGAL_ADMIN_MAP,
  },
  {
    name: 'legal_authority',
    endpoint: '/data/LegalAuthority',
    stagingTable: 'stg_legal_authority',
    primaryKey: 'ROW_ID',
    cursorLabel: 'Updated',
    searchSpec: () =>
      `([Legal Authority Code] = 'OPC-Perm Cust Trans-Cons-54.01' OR [Legal Authority Code] = 'OPO-Perm Custody Trans-54.01' OR [Legal Authority Code] = 'OPT-Perm Custody Trans-54.1') OR ([Expiry Date] IS NULL OR [Expiry Date] >= "${today()}")`,
    fieldMap: STG_LEGAL_AUTHORITY_MAP,
  },
  {
    name: 'agreements',
    endpoint: '/data/Agreement',
    stagingTable: 'stg_icm_agreement',
    primaryKey: 'ROW_ID',
    cursorLabel: 'Updated',
    searchSpec: () =>
      '([Agreement Type] = "SHSS" OR [Agreement Type] = "FCH" OR [Agreement Type] = "Out of Care")',
    fieldMap: STG_AGREEMENT_MAP,
  },
  {
    name: 'order_lines',
    endpoint: '/data/OrderLine',
    stagingTable: 'stg_icm_order_lines',
    primaryKey: 'ROW_ID',
    cursorLabel: 'Order Updated',
    searchSpec: () =>
      `[Product] <> "Recovered Funds" AND [Order Status] = "Closed" AND ([Order Type] = "Variable" OR [Order Type] = "ADJ-Variable" OR [Order Type] = "Monthly Family Care Rate" OR [Order Type] = "Adj-Monthly Family Care Rate" OR [Order Type] = "Maintenance Payment") AND [Order Effective Start Date] >= "${firstDayOfPreviousMonth()}"`,
    fieldMap: STG_ORDER_MAP,
  },
]

/** Configs for syncing data back to ICM */
export const ICM_SYNC_CONFIGS: IcmApiConfig[] = [
  {
    name: 'contacts',
    endpoint: '/data/Contact',
    stagingTable: 'stg_icm_contacts',
    primaryKey: 'id',
    cursorLabel: 'Updated',
    fieldMap: STG_ICM_CONTACTS_MAP,
  },
]
