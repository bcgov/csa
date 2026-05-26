-- ICM Person ID on agreement line (for OOC agreement lookup without placement)
ALTER TABLE csa.stg_icm_agreement ADD COLUMN X_CONTACT_NUM TEXT;

CREATE INDEX idx_stg_icm_agreement_x_contact_num ON csa.stg_icm_agreement (X_CONTACT_NUM);
