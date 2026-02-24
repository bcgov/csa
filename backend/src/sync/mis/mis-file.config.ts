export interface MisFileConfig {
  name: string
  s3Key: string
  stagingTable: string
  columns: string[]
}

export interface MisLastUpdatedConfig {
  name: string
  s3Key: string
}

// s3Key uses the MIS_S3_PREFIX from environment config
// Column order must match CSV header order (COPY FROM STDIN with HEADER)
export const MIS_FILE_CONFIGS: MisFileConfig[] = [
  {
    name: 'payments',
    s3Key: 'rap_payments.csv',
    stagingTable: 'stg_mis_payments',
    columns: [
      'id',
      'last_updated_date',
      'payment_number',
      'payment_type',
      'payment_status',
      'payment_amount',
      'payment_effective_start_date',
      'payment_effective_end_date',
      'contract_number',
      'payment_updated',
    ],
  },
  {
    name: 'contracts',
    s3Key: 'rap_contracts.csv',
    stagingTable: 'stg_mis_contracts',
    columns: [
      'id',
      'last_updated_date',
      'service_provider_id',
      'service_provider_name',
      'contract_number',
      'status',
      'contract_start_date',
      'contract_end_date',
      'contract_type',
      'termination_date',
    ],
  },
  {
    name: 'placements',
    s3Key: 'rap_placements.csv',
    stagingTable: 'stg_mis_placements',
    columns: [
      'id',
      'last_updated_date',
      'placement_location_no',
      'type',
      'sub_type',
      'status',
      'start_date',
      'end_date',
      'place_of_service_name',
      'service_provider_name',
      'service_provider_id',
      'contract_number',
      'legacy_file_number',
      'person_id_mis',
    ],
  },
]

export const MIS_LAST_UPDATED_CONFIG: MisLastUpdatedConfig = {
  name: 'last_updated',
  s3Key: 'last_updated.csv',
}
