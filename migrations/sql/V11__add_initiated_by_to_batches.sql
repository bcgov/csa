
ALTER TABLE csa.batches ADD COLUMN initiated_by VARCHAR(20) NOT NULL DEFAULT 'Ministry';
COMMENT ON COLUMN csa.batches.initiated_by IS 'Who created 
the batch: Ministry (user-created), CRA (auto-created from weekly CRA file)';