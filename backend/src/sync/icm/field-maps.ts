export interface FieldMapEntry {
  sourceField: string
  sourceLabel: string
  masterField: string
  dbType?: 'timestamp' | 'date' | 'numeric'
}

export const STG_ICM_CASES_MAP: FieldMapEntry[] = [
  { sourceField: 'ROW_ID', sourceLabel: 'Id', masterField: 'case_row_id_icm' },
  {
    sourceField: 'LAST_UPD',
    sourceLabel: 'Updated Date',
    masterField: 'last_upd_case_icm',
    dbType: 'timestamp',
  },

  {
    sourceField: 'FST_NAME',
    sourceLabel: 'Key Player AKA First Name',
    masterField: 'aka_first_name',
  },
  {
    sourceField: 'LAST_NAME',
    sourceLabel: 'Key Player AKA Last Name',
    masterField: 'aka_last_name',
  },
  { sourceField: 'X_AGE', sourceLabel: 'Key Player Age', masterField: 'age' },

  { sourceField: 'X_BIRTH_CITY', sourceLabel: 'Key Player Birth City', masterField: 'birth_city' },
  {
    sourceField: 'BIRTH_DT',
    sourceLabel: 'Key Player Birth Date',
    masterField: 'date_of_birth',
    dbType: 'date',
  },
  {
    sourceField: 'X_BIRTH_PROV_CD',
    sourceLabel: 'Key Player Birth Province',
    masterField: 'birth_province',
  },

  {
    sourceField: 'X_CSA_SENT_DATE',
    sourceLabel: 'Key Player CSA Sent Date',
    masterField: 'csa_sent_date',
    dbType: 'timestamp',
  },
  {
    sourceField: 'X_CSA_PAY_STATUS',
    sourceLabel: 'Key Player CSA Status',
    masterField: 'csa_status',
  },
  {
    sourceField: 'X_CSA_EFF_DATE',
    sourceLabel: 'Key Player CSA Status Effective Date',
    masterField: 'csa_status_effective_date',
    dbType: 'timestamp',
  },
  { sourceField: 'X_CSA_DIN', sourceLabel: 'Key Player DIN', masterField: 'din' },

  {
    sourceField: 'CONTACT_LAST_UPD',
    sourceLabel: 'Key Player Last Updated Date',
    masterField: 'last_upd_dt_contact_icm',
    dbType: 'timestamp',
  },
  { sourceField: 'SEX_MF', sourceLabel: 'Key Player M/F', masterField: 'gender' },
  {
    sourceField: 'BIRTH_PLACE',
    sourceLabel: 'Key Player Place of Birth',
    masterField: 'birth_country',
  },

  {
    sourceField: 'CONTACT_ROW_ID',
    sourceLabel: 'Key Player Id',
    masterField: 'contact_row_id_icm',
  },
  { sourceField: 'CASE_NUM', sourceLabel: 'Case Num', masterField: 'case_number' },
  {
    sourceField: 'X_LEGACY_FILE_NUM',
    sourceLabel: 'Legacy File Number',
    masterField: 'legacy_file_number',
  },
  { sourceField: 'TYPE_CD', sourceLabel: 'Type', masterField: 'case_type' },
  { sourceField: 'STATUS_CD', sourceLabel: 'Status', masterField: 'case_status' },
  { sourceField: 'X_CASELOAD', sourceLabel: 'Caseload', masterField: 'case_load' },

  { sourceField: 'NAME', sourceLabel: 'Office Name', masterField: 'service_office' },
  { sourceField: 'LOGIN', sourceLabel: 'Sales Rep', masterField: 'assigned_to' },

  {
    sourceField: 'SUBJECT_LAST_NAME',
    sourceLabel: 'Subject Contact Last Name',
    masterField: 'last_name',
  },
  { sourceField: 'SUBJECT_MID_NAME', sourceLabel: 'Middle Name', masterField: 'middle_name' },
  {
    sourceField: 'SUBJECT_FST_NAME',
    sourceLabel: 'Subject Contact First Name',
    masterField: 'first_name',
  },

  {
    sourceField: 'X_ADM_FIRST_NAME',
    sourceLabel: 'Admn First Name',
    masterField: 'adm_first_name',
  },
  { sourceField: 'X_ADM_LAST_NAME', sourceLabel: 'Admn Last Name', masterField: 'adm_last_name' },
  { sourceField: 'X_DECEASED', sourceLabel: 'Deceased', masterField: 'is_deceased' },
  {
    sourceField: 'PERSON_ID_MIS',
    sourceLabel: 'Key Player Integration Id',
    masterField: 'person_id_mis',
  },
]

export const STG_ICM_CONTACTS_MAP: FieldMapEntry[] = [
  { sourceField: 'Id', sourceLabel: 'Id', masterField: 'contact_id_icm' },
  { sourceField: 'X_CSA_DIN', sourceLabel: 'CSA DIN', masterField: 'din' },
  {
    sourceField: 'X_CSA_SENT_DATE',
    sourceLabel: 'CSA Sent Date',
    masterField: 'csa_sent_date',
    dbType: 'timestamp',
  },
  { sourceField: 'X_CSA_PAY_STATUS', sourceLabel: 'CSA Status', masterField: 'csa_status' },
  {
    sourceField: 'X_CSA_EFF_DATE',
    sourceLabel: 'CSA Status Effective Date',
    masterField: 'csa_status_effective_date',
    dbType: 'timestamp',
  },
]

export const STG_ICM_PLACEMENTS_MAP: FieldMapEntry[] = [
  { sourceField: 'ROW_ID', sourceLabel: 'Id', masterField: 'placement_id_icm' },
  {
    sourceField: 'LAST_UPD',
    sourceLabel: 'Updated',
    masterField: 'last_upd_placement_icm',
    dbType: 'timestamp',
  },
  {
    sourceField: 'X_PLACEMENT_NUM',
    sourceLabel: 'Placement Number',
    masterField: 'placement_location',
  },
  { sourceField: 'X_TYPE', sourceLabel: 'Type', masterField: 'location_type' },
  { sourceField: 'X_SERVICE_TYPE', sourceLabel: 'Service Type', masterField: 'location_sub_type' },
  { sourceField: 'X_STATUS', sourceLabel: 'Status', masterField: 'placement_status' },
  {
    sourceField: 'X_START_DATE',
    sourceLabel: 'Start Date',
    masterField: 'actual_start_date',
    dbType: 'timestamp',
  },
  {
    sourceField: 'X_END_DATE',
    sourceLabel: 'End Date',
    masterField: 'actual_end_date',
    dbType: 'timestamp',
  },
  {
    sourceField: 'X_SRV_PLC_NAME',
    sourceLabel: 'Place of Service',
    masterField: 'place_of_service_name',
  },
  {
    sourceField: 'X_ORIG_PLMT_PAID_UNPAID',
    sourceLabel: 'Paid/Unpaid?',
    masterField: 'paid_unpaid',
  },
  {
    sourceField: 'X_SRV_PROV_NAME',
    sourceLabel: 'Service Provider',
    masterField: 'service_provider_name',
  },
  { sourceField: 'OU_NUM', sourceLabel: 'Service Provider Id', masterField: 'provider_id' },
  {
    sourceField: 'X_PCMS_CONTRACT_NUM',
    sourceLabel: 'MCFD Contract Number',
    masterField: 'mcfd_contract',
  },
  {
    sourceField: 'X_PLACEMENT_ID',
    sourceLabel: 'Interrupted Placement #',
    masterField: 'interrupted_placement',
  },
  { sourceField: 'CASE_ROW_ID', sourceLabel: 'Case Id', masterField: 'case_rowid_icm' },
  { sourceField: 'AGREEMENT_ROW_ID', sourceLabel: 'Agreement Id', masterField: 'agreement_id' },
]

export const STG_LEGAL_ADMIN_MAP: FieldMapEntry[] = [
  {
    sourceField: 'LGL_AUTH_CD',
    sourceLabel: 'Legal Auth Code',
    masterField: 'legal_authority_code',
  },
  {
    sourceField: 'MIS_LGL_AUTH_CD',
    sourceLabel: 'MIS Legal Auth Code',
    masterField: 'mis_legal_authority_code',
  },
  { sourceField: 'ROW_ID', sourceLabel: 'Id', masterField: 'legal_admin_id' },
  {
    sourceField: 'LAST_UPD',
    sourceLabel: 'Updated',
    masterField: 'last_upd_dt_legal_admin',
    dbType: 'timestamp',
  },
  { sourceField: 'X_ENROLL_CSA', sourceLabel: 'Enroll for CSA', masterField: 'enroll_for_csa' },
]

export const STG_LEGAL_AUTHORITY_MAP: FieldMapEntry[] = [
  { sourceField: 'ROW_ID', sourceLabel: 'Id', masterField: 'legal_authority_code' },
  {
    sourceField: 'LAST_UPD',
    sourceLabel: 'Updated',
    masterField: 'last_upd_dt_legal_authority',
    dbType: 'timestamp',
  },
  {
    sourceField: 'LGL_AUTH_CD',
    sourceLabel: 'Legal Authority Code',
    masterField: 'legal_authority_code',
  },
  {
    sourceField: 'EFF_LGL_STATUS',
    sourceLabel: 'Effective Legal Status',
    masterField: 'effective_legal_status',
  },
  {
    sourceField: 'START_DT',
    sourceLabel: 'Effective Date',
    masterField: 'effective_date',
    dbType: 'timestamp',
  },
  {
    sourceField: 'EXPIRY_DT',
    sourceLabel: 'Expiry Date',
    masterField: 'expiry_date',
    dbType: 'timestamp',
  },
  { sourceField: 'PAR_ROW_ID', sourceLabel: 'Parent Contact Id', masterField: 'parent_contact_id' },
]

export const STG_AGREEMENT_MAP: FieldMapEntry[] = [
  { sourceField: 'NAME', sourceLabel: 'Service Provider', masterField: 'service_provider_name' },
  { sourceField: 'OU_NUM', sourceLabel: 'Service Provider Id', masterField: 'provider_id' },
  {
    sourceField: 'X_PCMS_CONTRACT_NUM',
    sourceLabel: 'ICM PCMS Contract Number',
    masterField: 'mcfd_contract',
  },
  { sourceField: 'STAT_CD', sourceLabel: 'Agreement Status', masterField: 'agreement_status' },
  {
    sourceField: 'EFF_START_DT',
    sourceLabel: 'Agreement Start Date',
    masterField: 'agreement_start_date',
    dbType: 'timestamp',
  },
  {
    sourceField: 'EFF_END_DT',
    sourceLabel: 'Agreement End Date',
    masterField: 'agreement_end_date',
    dbType: 'timestamp',
  },
  { sourceField: 'AGREE_CD', sourceLabel: 'Agreement Type', masterField: 'agreement_type' },
  { sourceField: 'ROW_ID', sourceLabel: 'Id', masterField: 'agreement_id_icm' },
  {
    sourceField: 'X_TERMINATION_DT',
    sourceLabel: 'ICM Termination Date',
    masterField: 'termination_date',
    dbType: 'timestamp',
  },
  {
    sourceField: 'LAST_UPD',
    sourceLabel: 'Updated',
    masterField: 'last_upd_dt_agreement',
    dbType: 'timestamp',
  },
]

export const STG_ORDER_MAP: FieldMapEntry[] = [
  { sourceField: 'ORDER_NUM', sourceLabel: 'Order Number', masterField: 'order_number' },
  { sourceField: 'NAME', sourceLabel: 'Order Type', masterField: 'order_type' },
  { sourceField: 'STATUS_CD', sourceLabel: 'Order Status', masterField: 'order_status' },
  {
    sourceField: 'TOTAL_AMT',
    sourceLabel: 'Order Amount',
    masterField: 'order_amount',
    dbType: 'numeric',
  },
  {
    sourceField: 'X_EFF_START_DT',
    sourceLabel: 'Order Effective Start Date',
    masterField: 'order_effective_start_date',
    dbType: 'timestamp',
  },
  {
    sourceField: 'X_EFF_END_DT',
    sourceLabel: 'Order Effective End Date',
    masterField: 'order_effective_end_date',
    dbType: 'timestamp',
  },
  { sourceField: 'PRODUCT_NAME', sourceLabel: 'Product', masterField: 'product' },
  {
    sourceField: 'X_PCMS_CONTRACT_NUM',
    sourceLabel: 'MCFD Contract Num',
    masterField: 'mcfd_contract',
  },
  { sourceField: 'AGREEMENT_ROW_ID', sourceLabel: 'Agreement Id', masterField: 'agreement_id_icm' },
  {
    sourceField: 'LAST_UPD',
    sourceLabel: 'Order Updated',
    masterField: 'last_upd_dt_order_icm',
    dbType: 'timestamp',
  },
  { sourceField: 'ROW_ID', sourceLabel: 'Id', masterField: 'order_id_icm' },
]
