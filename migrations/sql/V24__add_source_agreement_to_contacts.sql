ALTER TABLE csa.contacts
ADD COLUMN IF NOT EXISTS source_agreement TEXT;

COMMENT ON COLUMN csa.contacts.source_agreement IS 'ICM or MIS source for the primary agreement/contract displayed in CSA details';

UPDATE csa.contacts
SET source_agreement = source_placement
WHERE source_placement IS NOT NULL
  AND source_agreement IS NULL;
