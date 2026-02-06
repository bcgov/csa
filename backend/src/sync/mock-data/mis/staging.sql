CREATE TABLE IF NOT EXISTS csa.stg_mis_payments (
    id                     INTEGER PRIMARY KEY,
    payment_number         TEXT ,
    payment_type           TEXT,
    payment_status         TEXT,
    payment_amount         TEXT,
    payment_effective_start_date DATE,
    product                TEXT,
    agreement_num          TEXT,
    contract_num           TEXT,
    contract_id            INTEGER,
    payment_updated        TEXT,
    person_id_mis          TEXT,
    last_updated_date      DATE,
    file_stat_cd           TEXT,
    process_dt             DATE,
    ingested_at            TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_mis_contracts (
    id INTEGER PRIMARY KEY,
    service_provider_name TEXT,
    contract_number TEXT,
    status TEXT,
    contract_start_date DATE,
    contract_end_date DATE,
    type TEXT,
    contract_termination_date DATE,
    last_updated_date DATE,
    file_stat_cd TEXT,
    process_dt DATE,
    ingested_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE csa.stg_mis_placements (
    id INTEGER PRIMARY KEY,
    placement_location_no TEXT,
    type TEXT,
    sub_type TEXT,
    status TEXT,
    start_date DATE,
    end_date DATE,
    place_of_service_name TEXT,
    service_provider_name TEXT,
    service_provider_id TEXT,
    contract_no TEXT,
    client_fileid_dep_no TEXT,
    last_updated_date DATE,
    file_stat_cd TEXT,
    process_dt DATE,
    ingested_at TIMESTAMP DEFAULT NOW()
);
