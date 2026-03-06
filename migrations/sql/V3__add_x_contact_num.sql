ALTER TABLE csa.stg_icm_cases ADD COLUMN X_CONTACT_NUM TEXT;

CREATE INDEX idx_stg_icm_cases_x_contact_num ON csa.stg_icm_cases (X_CONTACT_NUM);
