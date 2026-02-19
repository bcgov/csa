CREATE SCHEMA IF NOT EXISTS csa;

-- Trigram extension for substring search (ILIKE '%term%')
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- master tables
CREATE TABLE IF NOT EXISTS csa.contacts (
  id                          SERIAL PRIMARY KEY,
  last_name                   TEXT        NOT NULL,
  first_name                  TEXT        NOT NULL,
  middle_name                 TEXT        NOT NULL,
  aka_last_name               TEXT        NOT NULL,
  aka_first_name              TEXT        NOT NULL,
  person_id_icm               TEXT        NOT NULL UNIQUE,
  person_id_mis               TEXT        NOT NULL,
  gender                      TEXT,
  date_of_birth               DATE,
  age                         INTEGER,
  csa_age                     INTEGER,
  case_number                 TEXT        NOT NULL,
  legacy_file_number          TEXT,
  case_type                   TEXT        NOT NULL,
  case_status                 TEXT        NOT NULL,
  case_load                   TEXT        NOT NULL,
  service_office              TEXT,
  assigned_to                 TEXT,
  csa_status                  TEXT,
  csa_status_effective_date   TIMESTAMP,
  csa_sent_date               TIMESTAMP,
  din                         TEXT,
  effective_legal_status      TEXT,
  effective_date              TIMESTAMP,
  expiry_date                 DATE,
  enroll_for_csa              TEXT,
  mis_legal_authority_code    TEXT,
  legal_authority_code        TEXT,
  birth_city                  TEXT,
  birth_province              TEXT,
  birth_country               TEXT,
  placement_location          TEXT,
  location_type               TEXT,
  location_sub_type           TEXT,
  placement_status            TEXT,
  actual_start_date           TIMESTAMP,
  actual_end_date             TIMESTAMP,
  paid_unpaid                 TEXT,
  interrupted_placement       TEXT,
  source_placement            TEXT,
  service_provider_name       TEXT,
  provider_id                 TEXT,
  place_of_service_name       TEXT,
  agreement_type              TEXT,
  agreement_status            TEXT,
  agreement_start_date        TIMESTAMP,
  agreement_end_date          TIMESTAMP,
  termination_date            TIMESTAMP,
  mcfd_contract               TEXT,
  order_number                TEXT,
  order_type                  TEXT,
  order_status                TEXT,
  order_amount                TEXT,
  order_effective_start_date  DATE,
  order_effective_end_date    DATE,
  product                     TEXT,
  source_order                TEXT        NOT NULL,
  resume_status               TEXT,
  pre_batch_status            TEXT,
  hold_by                     TEXT,
  prev_recipient_first_name   TEXT,
  prev_recipient_last_name    TEXT,
  cancel_reason_code          TEXT,
  care_end_date               DATE,
  is_in_eligible              BOOLEAN     DEFAULT FALSE,
  is_deceased                 TEXT,
  icm_integration_status      BOOLEAN     NOT NULL,
  created_at                  TIMESTAMP   NOT NULL,
  created_by                  TEXT        NOT NULL,
  last_updated_at             TIMESTAMP   NOT NULL,
  last_updated_by             TEXT        NOT NULL
);

-- Concatenates searchable text fields Automatically updated by PostgreSQL on INSERT/UPDATE
ALTER TABLE csa.contacts
ADD COLUMN search_text TEXT GENERATED ALWAYS AS (
    coalesce(last_name, '') || ' | ' || coalesce(first_name, '') || ' | ' || coalesce(middle_name, '') || ' | ' || coalesce(aka_last_name, '') || ' | ' || coalesce(aka_first_name, '') || ' | ' || coalesce(case_number, '') || ' | ' || coalesce(legacy_file_number, '') || ' | ' || coalesce(din, '')
) STORED;

ALTER TABLE csa.contacts ALTER COLUMN search_text SET NOT NULL;

-- Full-text search index (trigram for ILIKE '%term%' queries)
CREATE INDEX idx_contacts_search_text_trgm ON csa.contacts USING GIN (search_text gin_trgm_ops);

CREATE TABLE IF NOT EXISTS csa.batches (
    id SERIAL PRIMARY KEY,
    batch_date DATE NOT NULL,
    status TEXT NOT NULL,
    record_count INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL,
    system_comments TEXT
);

CREATE UNIQUE INDEX batches_pending_unique ON csa.batches (status)
WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS csa.contact_batch_details (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER NOT NULL,
    batch_id INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,
    reference_number TEXT UNIQUE,
    system_comments TEXT,
    created_at TIMESTAMP NOT NULL,
    created_by TEXT NOT NULL,
    last_updated_at TIMESTAMP NOT NULL,
    last_updated_by TEXT NOT NULL,
    status TEXT,
    CONSTRAINT contact_batch_unique UNIQUE (contact_id, batch_id),
    CONSTRAINT fk_cbd_contact FOREIGN KEY (contact_id) REFERENCES csa.contacts (id),
    CONSTRAINT fk_cbd_batch FOREIGN KEY (batch_id) REFERENCES csa.batches (id)
);

CREATE TABLE IF NOT EXISTS csa.job_runs (
    id SERIAL PRIMARY KEY,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL,
    parent_job_id INTEGER REFERENCES csa.job_runs (id),
    job_trigger TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP
);

CREATE INDEX idx_job_runs_status ON csa.job_runs (status);
CREATE INDEX idx_job_runs_parent ON csa.job_runs (parent_job_id);
CREATE INDEX idx_job_runs_type_status ON csa.job_runs (job_type, status);

CREATE TABLE IF NOT EXISTS csa.transfer_files (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER,
    destination_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size TEXT,
    delivered_at TIMESTAMP,
    downloaded_at TIMESTAMP,
    reference_numbers INTEGER[],
    is_processed BOOLEAN DEFAULT FALSE,
    is_valid BOOLEAN DEFAULT TRUE,
    sequence_number INTEGER,
    CONSTRAINT fk_transfer_files_batch FOREIGN KEY (batch_id) REFERENCES csa.batches (id)
);

-- staging tables

CREATE TABLE IF NOT EXISTS csa.stg_icm_cases (
    ROW_ID TEXT PRIMARY KEY,
    LAST_UPD TEXT,
    FST_NAME TEXT,
    LAST_NAME TEXT,
    X_AGE TEXT,
    X_BIRTH_CITY TEXT,
    BIRTH_DT TEXT,
    X_BIRTH_PROV_CD TEXT,
    X_CSA_SENT_DATE TEXT,
    X_CSA_PAY_STATUS TEXT,
    X_CSA_EFF_DATE TEXT,
    X_CSA_DIN TEXT,
    CONTACT_LAST_UPD TEXT,
    SEX_MF TEXT,
    BIRTH_PLACE TEXT,
    CONTACT_ROW_ID TEXT,
    CASE_NUM TEXT,
    X_LEGACY_FILE_NUM TEXT,
    TYPE_CD TEXT,
    STATUS_CD TEXT,
    X_CASELOAD TEXT,
    NAME TEXT,
    LOGIN TEXT,
    SUBJECT_LAST_NAME TEXT,
    SUBJECT_MID_NAME TEXT,
    SUBJECT_FST_NAME TEXT,
    X_ADM_FIRST_NAME TEXT,
    X_ADM_LAST_NAME TEXT,
    X_DECEASED TEXT,
    PERSON_ID_MIS TEXT,
    INGESTED_AT TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_icm_placements (
    ROW_ID TEXT PRIMARY KEY,
    LAST_UPD TEXT,
    X_PLACEMENT_NUM TEXT,
    X_TYPE TEXT,
    X_SERVICE_TYPE TEXT,
    X_STATUS TEXT,
    X_START_DATE TEXT,
    X_END_DATE TEXT,
    X_SRV_PLC_NAME TEXT,
    X_ORIG_PLMT_PAID_UNPAID TEXT,
    X_SRV_PROV_NAME TEXT,
    OU_NUM TEXT,
    X_PCMS_CONTRACT_NUM TEXT,
    X_PLACEMENT_ID TEXT,
    CASE_ROW_ID TEXT,
    AGREEMENT_ROW_ID TEXT,
    INGESTED_AT TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_icm_legal_authority_admin (
    ROW_ID TEXT PRIMARY KEY,
    LGL_AUTH_CD TEXT,
    MIS_LGL_AUTH_CD TEXT,
    LAST_UPD TEXT,
    X_ENROLL_CSA TEXT,
    INGESTED_AT TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_legal_authority (
    ROW_ID TEXT PRIMARY KEY,
    LAST_UPD TEXT,
    LGL_AUTH_CD TEXT,
    EFF_LGL_STATUS TEXT,
    START_DT TEXT,
    EXPIRY_DT TEXT,
    PAR_ROW_ID TEXT,
    INGESTED_AT TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_icm_agreement (
    ROW_ID TEXT PRIMARY KEY,
    NAME TEXT,
    OU_NUM TEXT,
    X_PCMS_CONTRACT_NUM TEXT,
    STAT_CD TEXT,
    EFF_START_DT TEXT,
    EFF_END_DT TEXT,
    AGREE_CD TEXT,
    X_TERMINATION_DT TEXT,
    LAST_UPD TEXT,
    INGESTED_AT TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_icm_orders (
    ROW_ID                  TEXT PRIMARY KEY,
    ORDER_NUM               TEXT,
    NAME                    TEXT,
    STATUS_CD               TEXT,
    TOTAL_AMT               TEXT,
    X_EFF_START_DT          TEXT,
    PRODUCT_NAME            TEXT,
    X_PCMS_CONTRACT_NUM     TEXT,
    AGREEMENT_ROW_ID        TEXT,
    LAST_UPD                TEXT,
    INGESTED_AT             TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_mis_payments (
    id TEXT PRIMARY KEY,
    last_updated_date TEXT,
    payment_number TEXT,
    payment_type TEXT,
    payment_status TEXT,
    payment_amount TEXT,
    payment_effective_start_date TEXT,
    payment_effective_end_date TEXT,
    product TEXT,
    contract_number TEXT,
    payment_updated TEXT,
    person_id_mis TEXT,
    ingested_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_mis_contracts (
    id TEXT PRIMARY KEY,
    last_updated_date TEXT,
    service_provider_id TEXT,
    service_provider_name TEXT,
    contract_number TEXT,
    status TEXT,
    contract_start_date TEXT,
    contract_end_date TEXT,
    type TEXT,
    contract_termination_date TEXT,
    person_id_mis TEXT,
    ingested_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_mis_placements (
    id TEXT PRIMARY KEY,
    last_updated_date TEXT,
    placement_location_no TEXT,
    type TEXT,
    sub_type TEXT,
    status TEXT,
    start_date TEXT,
    end_date TEXT,
    place_of_service_name TEXT,
    service_provider_name TEXT,
    service_provider_id TEXT,
    contract_number TEXT,
    legacy_file_number TEXT,
    person_id_mis TEXT,
    ingested_at TIMESTAMP DEFAULT NOW()
);

-- staging table indexes

-- ICM staging indexes (eligibility query joins)
CREATE INDEX idx_stg_icm_placements_case ON csa.stg_icm_placements (CASE_ROW_ID);
CREATE INDEX idx_stg_icm_placements_agreement ON csa.stg_icm_placements (AGREEMENT_ROW_ID);
CREATE INDEX idx_stg_icm_orders_agreement ON csa.stg_icm_orders (AGREEMENT_ROW_ID);
CREATE INDEX idx_stg_legal_authority_parent ON csa.stg_legal_authority (PAR_ROW_ID);

-- MIS staging indexes (eligibility query joins)
CREATE INDEX idx_stg_mis_payments_person ON csa.stg_mis_payments (person_id_mis);
CREATE INDEX idx_stg_mis_payments_contract ON csa.stg_mis_payments (contract_number);
CREATE INDEX idx_stg_mis_placements_person ON csa.stg_mis_placements (person_id_mis);
CREATE INDEX idx_stg_mis_placements_contract ON csa.stg_mis_placements (contract_number);
CREATE INDEX idx_stg_mis_placements_legacy ON csa.stg_mis_placements (legacy_file_number);
CREATE INDEX idx_stg_mis_contracts_number ON csa.stg_mis_contracts (contract_number);
CREATE INDEX idx_stg_mis_contracts_person ON csa.stg_mis_contracts (person_id_mis);

-- db users permissons
GRANT USAGE ON SCHEMA csa TO "csa-app";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA csa TO "csa-app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA csa TO "csa-app";
ALTER DEFAULT PRIVILEGES FOR ROLE "csa-admin" IN SCHEMA csa
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO "csa-app";
ALTER DEFAULT PRIVILEGES FOR ROLE "csa-admin" IN SCHEMA csa
  GRANT USAGE, SELECT ON SEQUENCES TO "csa-app";
