import {
  daysAgoPacific,
  firstDayOfPreviousMonthPacific,
  formatDatePacific,
  formatDateTimePacific,
  getAgeCutoffDate,
} from 'src/common/utils'
import {
  FieldMapEntry,
  STG_AGREEMENT_MAP,
  STG_ICM_CASES_MAP,
  STG_ICM_CONTACTS_MAP,
  STG_ICM_PLACEMENTS_MAP,
  STG_LEGAL_ADMIN_MAP,
  STG_LEGAL_AUTHORITY_MAP,
  STG_ORDER_MAP,
} from './field-maps'

export interface IcmApiConfig {
  name: string
  endpoint: string
  stagingTable: string
  primaryKey: string
  cursorLabel: string | string[]
  searchSpec?: () => string
  fieldMap: FieldMapEntry[]
}
// TODO: date may not need DateTime as query params
// Configs for ingesting ICM data into staging tables
export const ICM_INGESTION_CONFIGS: IcmApiConfig[] = [
  {
    name: 'cases',
    endpoint: '/Cases/Case',
    stagingTable: 'stg_icm_cases',
    primaryKey: 'ROW_ID',
    cursorLabel: ['Key Player Last Updated Date', 'Last Updated Date'],
    searchSpec: () =>
      `[Type] = "Child Services" AND [Key Player Birth Date] >= "${formatDatePacific(getAgeCutoffDate())}"`,
    fieldMap: STG_ICM_CASES_MAP,
  },
  {
    name: 'placements',
    endpoint: '/Placements/Placement',
    stagingTable: 'stg_icm_placements',
    primaryKey: 'ROW_ID',
    cursorLabel: 'Updated',
    searchSpec: () =>
      `[Status] = "Active" OR [Status] = "Interrupted" OR ([Status] = "Ended" AND [End Date] >= "${formatDatePacific(firstDayOfPreviousMonthPacific())}")`,
    fieldMap: STG_ICM_PLACEMENTS_MAP,
  },
  {
    name: 'legal_authority_admin',
    endpoint: '/ContactLegalAuthorityAdmin/ContactLegalAuthorityAdmin',
    stagingTable: 'stg_icm_legal_authority_admin',
    primaryKey: 'ROW_ID',
    cursorLabel: 'Updated',
    fieldMap: STG_LEGAL_ADMIN_MAP,
  },
  {
    name: 'legal_authority',
    endpoint: '/ContactLegalAuthorities/ContactLegalAuthority',
    stagingTable: 'stg_icm_legal_authority',
    primaryKey: 'ROW_ID',
    cursorLabel: 'Updated',
    searchSpec: () =>
      `([Legal Authority Code] = 'OPC-Perm Cust Trans-Cons-54.01' OR [Legal Authority Code] = 'OPO-Perm Custody Trans-54.01' OR [Legal Authority Code] = 'OPT-Perm Custody Trans-54.1') OR ([Expiry Date] IS NULL OR [Expiry Date] >= "${formatDatePacific(daysAgoPacific(60))}")`,
    fieldMap: STG_LEGAL_AUTHORITY_MAP,
  },
  {
    name: 'agreements',
    endpoint: '/Agreements/Agreements',
    stagingTable: 'stg_icm_agreement',
    primaryKey: 'ROW_ID',
    cursorLabel: 'Updated',
    searchSpec: () =>
      '([Agreement Type] = "SHSS" OR [Agreement Type] = "FCH" OR [Agreement Type] = "Out of Care")',
    fieldMap: STG_AGREEMENT_MAP,
  },
  {
    name: 'orders',
    endpoint: '/OrderLines/OrderLine',
    stagingTable: 'stg_icm_orders',
    primaryKey: 'ROW_ID',
    cursorLabel: 'Order Updated',
    searchSpec: () =>
      `[Product] <> "Recovered Funds" AND [Order Status] = "Closed" AND ([Order Type] = "Variable" OR [Order Type] = "ADJ-Variable" OR [Order Type] = "Monthly Family Care Rate" OR [Order Type] = "ADJ-Monthly Family Care Rate" OR [Order Type] = "Maintenance Payment") AND [Order Effective Start Date] >= "${formatDateTimePacific(firstDayOfPreviousMonthPacific())}"`,
    fieldMap: STG_ORDER_MAP,
  },
]

export const ICM_UPDATE_BATCH_LIMIT = 100

export const ICM_SYNC_CONFIGS: IcmApiConfig[] = [
  {
    name: 'contacts',
    endpoint: '/ICMContact/ICMContact',
    stagingTable: 'stg_icm_contacts',
    primaryKey: 'Id',
    cursorLabel: 'Updated',
    fieldMap: STG_ICM_CONTACTS_MAP,
  },
]
