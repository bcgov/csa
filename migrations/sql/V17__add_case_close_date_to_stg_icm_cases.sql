-- ICM Cases: close metadata from Cases/Case (BL-24 close date tie-break; reason stored for future use)
ALTER TABLE csa.stg_icm_cases ADD COLUMN CLOSE_DT TEXT;
ALTER TABLE csa.stg_icm_cases ADD COLUMN CLOSE_REASON TEXT;
