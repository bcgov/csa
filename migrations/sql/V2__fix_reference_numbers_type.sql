ALTER TABLE csa.transfer_files
  ALTER COLUMN reference_numbers TYPE TEXT[]
  USING reference_numbers::TEXT[];
