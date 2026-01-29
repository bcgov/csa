CREATE SCHEMA IF NOT EXISTS csa;

CREATE TABLE IF NOT EXISTS csa.contacts (
  id                          SERIAL PRIMARY KEY,
  last_name                   TEXT        NOT NULL,
  first_name                  TEXT        NOT NULL,
  middle_name                 TEXT        NOT NULL,
  aka_last_name               TEXT        NOT NULL,
  aka_first_name              TEXT        NOT NULL,
  person_id_icm               TEXT        NOT NULL,
  person_id_mis               TEXT        NOT NULL,
  gender                      TEXT,
  date_of_birth               DATE,
  age                         INTEGER,
  csa_age                     INTEGER,
  case_number                 TEXT        NOT NULL,
  legacy_file_number          TEXT,
  case_type                   TEXT        NOT NULL,
  case_status                 TEXT        NOT NULL,
  case_load                   TEXT        NOT NULL,
  service_office              TEXT,
  assigned_to                 TEXT,
  csa_status                  TEXT,
  csa_status_effective_date   TIMESTAMP,
  csa_sent_date               TIMESTAMP,
  din                         TEXT,
  effective_legal_status      TEXT,
  effective_date              TIMESTAMP,
  expiry_date                 DATE,
  enroll_for_csa              TEXT,
  mis_legal_authority_code    TEXT,
  legal_authority_code        TEXT,
  birth_city                  TEXT,
  birth_province              TEXT,
  birth_country               TEXT,
  placement_location          TEXT,
  location_type               TEXT,
  location_sub_type           TEXT,
  placement_status            TEXT,
  actual_start_date           TIMESTAMP,
  actual_end_date             TIMESTAMP,
  paid_unpaid                 TEXT,
  interrupted_placement       TEXT,
  source_placement            TEXT,
  service_provider_name       TEXT,
  provider_id                 TEXT,
  place_of_service_name       TEXT,
  agreement_type              TEXT,
  agreement_status            TEXT,
  agreement_start_date        TIMESTAMP,
  agreement_end_date          TIMESTAMP,
  termination_date            TIMESTAMP,
  mcfd_contract               TEXT,
  order_number                TEXT,
  order_type                  TEXT,
  order_status                TEXT,
  order_amount                TEXT,
  order_effective_start_date  DATE,
  product                     TEXT,
  source_order                TEXT        NOT NULL,
  resume_status               TEXT,
  hold_by                     TEXT,
  icm_integration_status      BOOLEAN     NOT NULL,
  created_at                  TIMESTAMP   NOT NULL,
  created_by                  TEXT        NOT NULL,
  last_updated_at             TIMESTAMP   NOT NULL,
  last_updated_by             TEXT        NOT NULL
);

CREATE TABLE IF NOT EXISTS csa.batches (
    id              SERIAL PRIMARY KEY,
    batch_date      DATE        NOT NULL,
    status          TEXT        NOT NULL,
    record_count    INTEGER     NOT NULL,
    created_at      TIMESTAMP   NOT NULL,
    system_comments TEXT
);

CREATE TABLE IF NOT EXISTS csa.contact_batch_details (
  id                SERIAL PRIMARY KEY,
  contact_id        INTEGER     NOT NULL,
  batch_id          INTEGER     NOT NULL,
  transaction_type  TEXT        NOT NULL,
  system_comments   TEXT,
  created_at        TIMESTAMP   NOT NULL,
  created_by        TEXT        NOT NULL,
  last_updated_at   TIMESTAMP   NOT NULL,
  last_updated_by   TEXT        NOT NULL,
  status            TEXT,
  CONSTRAINT contact_batch_unique UNIQUE (contact_id, batch_id),
  CONSTRAINT fk_cbd_contact FOREIGN KEY (contact_id) REFERENCES csa.contacts (id),
  CONSTRAINT fk_cbd_batch   FOREIGN KEY (batch_id)   REFERENCES csa.batches  (id)
);

CREATE TABLE IF NOT EXISTS csa.job_runs (
  id             SERIAL PRIMARY KEY,
  job_type       TEXT        NOT NULL,
  status         TEXT        NOT NULL,
  parent_job_id  INTEGER     REFERENCES csa.job_runs(id),
  job_trigger    TEXT        NOT NULL,
  retry_count    INTEGER     DEFAULT 0,
  error          TEXT,
  metadata       JSONB       DEFAULT '{}'::jsonb,
  created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMP   NOT NULL,
  completed_at   TIMESTAMP
);

CREATE INDEX idx_job_runs_status ON csa.job_runs(status);
CREATE INDEX idx_job_runs_parent ON csa.job_runs(parent_job_id);
CREATE INDEX idx_job_runs_type_status ON csa.job_runs(job_type, status);

CREATE TABLE IF NOT EXISTS csa.transfer_files (
  id                 SERIAL PRIMARY KEY,
  batch_id           INTEGER,
  destination_id     TEXT        NOT NULL,
  direction          TEXT        NOT NULL,
  file_name          TEXT        NOT NULL,
  file_size          TEXT,
  delivered_at       TIMESTAMP,
  downloaded_at      TIMESTAMP,
  reference_numbers  INTEGER[], -- contact_batch_details.id
  CONSTRAINT fk_transfer_files_batch FOREIGN KEY (batch_id) REFERENCES csa.batches (id)
);
