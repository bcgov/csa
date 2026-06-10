-- ICM Cases: close metadata from Cases/Case (BL-24 close date tie-break; reason stored for future use)
ALTER TABLE csa.stg_icm_cases ADD COLUMN CLOSED_DT TEXT;
ALTER TABLE csa.stg_icm_cases ADD COLUMN X_CLOSED_RSN_CD TEXT;
