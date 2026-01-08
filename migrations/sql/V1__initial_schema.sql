CREATE SCHEMA IF NOT EXISTS csa;

CREATE TABLE csa.applicants
(
    id SERIAL PRIMARY KEY,
    last_name VARCHAR(40) NOT NULL,
    given_name VARCHAR(40) NOT NULL,
    middle_name VARCHAR(40) NOT NULL,
    aka_last_name VARCHAR(40) NOT NULL,
    aka_first_name VARCHAR(40) NOT NULL,
    person_id_icm VARCHAR(30) NOT NULL,
    person_id_ims VARCHAR(30) NOT NULL,
    gender VARCHAR(30),
    date_of_birth DATE,
    age INTEGER,
    case_number VARCHAR(30),
    legacy_file_number VARCHAR(30) NOT NULL,
    case_type VARCHAR(30),
    case_status VARCHAR(30) NOT NULL,
    case_load VARCHAR(15) NOT NULL,
    service_office VARCHAR(50),
    assigned_to VARCHAR(30),
    csa_status VARCHAR(30),
    csa_status_effective_date TIMESTAMP,
    csa_sent_date TIMESTAMP,
    din VARCHAR(9),
    effective_legal_status VARCHAR(30),
    effective_date TIMESTAMP,
    enroll_for_csa VARCHAR(10),
    birth_city VARCHAR(30),
    birth_province VARCHAR(2),
    birth_country VARCHAR(30),
    placement_location VARCHAR(50),
    type VARCHAR(50),
    sub_type VARCHAR(100),
    placement_status VARCHAR(50),
    actual_start_date TIMESTAMP,
    actual_end_date TIMESTAMP,
    paid_unpaid VARCHAR(50),
    service_provider_name VARCHAR(100),
    provider_id VARCHAR(50),
    place_of_service_name VARCHAR(100),
    agreement_type VARCHAR(30),
    agreement_status VARCHAR(30),
    agreement_start_date TIMESTAMP,
    agreement_end_date TIMESTAMP,
    termination_date TIMESTAMP,
    mcfd_contract VARCHAR(30),
    order_number VARCHAR(30),
    order_status VARCHAR(30),
    order_amount NUMERIC(22, 7),
    order_effective_start_date DATE,
    source VARCHAR(30) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(30) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    updated_by VARCHAR(30) NOT NULL
);

CREATE TABLE csa.batches
(
    id SERIAL PRIMARY KEY,
    batch_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL,
    record_count INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL,
    comments VARCHAR(250)
);

CREATE TABLE csa.applicant_batch_details
(
    id SERIAL PRIMARY KEY,
    applicant_id INTEGER NOT NULL,
    batch_id INTEGER NOT NULL,
    transaction_type VARCHAR(15) NOT NULL,
    comments VARCHAR(250),
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(30) NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    updated_by VARCHAR(30) NOT NULL,
    CONSTRAINT fk_applicant FOREIGN KEY (applicant_id) REFERENCES csa.applicants(id),
    CONSTRAINT fk_batch FOREIGN KEY (batch_id) REFERENCES csa.batches(id),
    CONSTRAINT applicant_batch_unique UNIQUE (applicant_id, batch_id)
);
