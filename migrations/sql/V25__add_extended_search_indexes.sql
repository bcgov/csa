-- Add trigram indexes for weekly child search fields
-- Supports contains/ILIKE searches on person IDs and birth place components.

CREATE INDEX IF NOT EXISTS idx_contacts_person_id_icm_trgm ON csa.contacts USING GIN (person_id_icm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_person_id_mis_trgm ON csa.contacts USING GIN (person_id_mis gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_birth_city_trgm ON csa.contacts USING GIN (birth_city gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_birth_province_trgm ON csa.contacts USING GIN (birth_province gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_birth_country_trgm ON csa.contacts USING GIN (birth_country gin_trgm_ops);
