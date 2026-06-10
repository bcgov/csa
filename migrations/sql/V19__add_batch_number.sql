ALTER TABLE csa.batches ADD COLUMN batch_number INTEGER;

UPDATE csa.batches b
SET batch_number = numbered.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM csa.batches
) numbered
WHERE b.id = numbered.id;

ALTER TABLE csa.batches ALTER COLUMN batch_number SET NOT NULL;

CREATE UNIQUE INDEX batches_batch_number_unique ON csa.batches (batch_number);
