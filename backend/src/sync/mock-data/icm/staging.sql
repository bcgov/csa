CREATE TABLE IF NOT EXISTS csa.stg_icm_cases (
    ROW_ID             TEXT PRIMARY KEY,
    LAST_UPD           TIMESTAMP,
    FST_NAME           TEXT,
    LAST_NAME          TEXT,
    X_AGE              TEXT,
    X_BIRTH_CITY       TEXT,
    BIRTH_DT           DATE,
    X_BIRTH_PROV_CD    TEXT,
    X_CSA_SENT_DATE    TIMESTAMP,
    X_CSA_PAY_STATUS   TEXT,
    X_CSA_EFF_DATE     TIMESTAMP,
    X_CSA_DIN          TEXT,
    SEX_MF             TEXT,
    BIRTH_PLACE        TEXT,
    ROW_ID_CASE        TEXT,
    CASE_NUM           TEXT,
    X_LEGACY_FILE_NUM  TEXT,
    TYPE_CD            TEXT,
    STATUS_CD          TEXT,
    X_CASELOAD         TEXT,
    NAME               TEXT,
    LOGIN              TEXT,
    MID_NAME           TEXT,
    X_ADM_FIRST_NAME   TEXT,
    X_ADM_LAST_NAME    TEXT,
    ingested_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_icm_contacts (
    Id                TEXT PRIMARY KEY,
    X_CSA_DIN         TEXT,
    X_CSA_SENT_DATE   TIMESTAMP,
    X_CSA_PAY_STATUS  TEXT,
    X_CSA_EFF_DATE    TIMESTAMP,
    ingested_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_icm_placements (
    Id                          TEXT PRIMARY KEY,
    LAST_UPD                    TIMESTAMP,
    X_PLACEMENT_NUM             TEXT,
    X_TYPE                        TEXT,
    X_SERVICE_TYPE              TEXT,
    X_STATUS                    TEXT,
    X_START_DATE                TIMESTAMP,
    X_END_DATE                  TIMESTAMP,
    NAME_PLACE_OF_SERVICE       TEXT,
    X_ORIG_PLMT_PAID_UNPAID     TEXT,
    NAME_SERVICE_PROVIDER       TEXT,
    OU_NUM                      TEXT,
    X_PCMS_CONTRACT_NUM         TEXT,
    X_PLACEMENT_ID              TEXT,
    Case_Id                     TEXT,
    Agreement_Id                TEXT,
    ingested_at                 TIMESTAMP DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS csa.stg_icm_legal_authority_admin (
    Id                  TEXT PRIMARY KEY,
    LGL_AUTH_CD         TEXT,
    MIS_LGL_AUTH_CD     TEXT,
    LAST_UPD            TIMESTAMP,
    X_ENROLL_CSA        TEXT,
    ingested_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_legal_authority (
    Id                  TEXT PRIMARY KEY,
    LAST_UPD            TIMESTAMP,
    LGL_AUTH_CD         TEXT,
    EFF_LGL_STATUS      TEXT,
    START_DT            TIMESTAMP,
    EXPIRY_DT           TIMESTAMP,
    PAR_ROW_ID          TEXT,
    ingested_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_icm_agreement (
    ID                    TEXT PRIMARY KEY,
    NAME                  TEXT,
    OU_NUM                TEXT,
    X_PCMS_CONTRACT_NUM   TEXT,
    STAT_CD               TEXT,
    EFF_START_DT          TIMESTAMP,
    EFF_END_DT            TIMESTAMP,
    AGREE_CD              TEXT,
    X_TERMINATION_DT      TIMESTAMP,
    LAST_UPD              TIMESTAMP,
    ingested_at           TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csa.stg_icm_order_lines (
    Id                      TEXT PRIMARY KEY,
    ORDER_NUM               TEXT,
    NAME                    TEXT,
    STATUS_CD               TEXT,
    TOTAL_AMT               NUMERIC,
    X_EFF_START_DT          TIMESTAMP,
    X_PCMS_CONTRACT_NUM     TEXT,
    AGREE_ID                TEXT,
    LAST_UPD                TIMESTAMP,
    ingested_at             TIMESTAMP DEFAULT NOW()
);
