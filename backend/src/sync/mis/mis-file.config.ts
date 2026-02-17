export interface MisFileConfig {
  name: string
  s3Key: string
  stagingTable: string
  columns: string[]
}

// s3Key uses the MIS_S3_PREFIX from environment config
export const MIS_FILE_CONFIGS: MisFileConfig[] = [
  {
    name: 'payments',
    s3Key: 'CSAS3_Payments.csv',
    stagingTable: 'stg_mis_payments',
    columns: [
      'payment_number',
      'id',
      'payment_type',
      'payment_status',
      'payment_amount',
      'payment_effective_start_date',
      'payment_effective_end_date',
      'product',
      'agreement_num',
      'contract_num',
      'contract_id',
      'payment_updated',
      'person_id_mis',
      'last_updated_date',
      'file_stat_cd',
      'process_dt',
    ],
  },
  {
    name: 'contracts',
    s3Key: 'CSAS3_Contract.csv',
    stagingTable: 'stg_mis_contracts',
    columns: [
      'id',
      'service_provider_name',
      'contract_number',
      'status',
      'contract_start_date',
      'contract_end_date',
      'type',
      'contract_termination_date',
      'last_updated_date',
      'file_stat_cd',
      'process_dt',
    ],
  },
  {
    name: 'placements',
    s3Key: 'CSAS3_Placement.csv',
    stagingTable: 'stg_mis_placements',
    columns: [
      'id',
      'placement_location_no',
      'type',
      'sub_type',
      'status',
      'start_date',
      'end_date',
      'place_of_service_name',
      'service_provider_name',
      'service_provider_id',
      'contract_no',
      'client_fileid_dep_no',
      'person_id_mis',
      'last_updated_date',
      'file_stat_cd',
      'process_dt',
    ],
  },
]
