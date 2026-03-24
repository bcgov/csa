ALTER TABLE csa.contacts
  ALTER COLUMN actual_start_date    TYPE DATE USING (actual_start_date AT TIME ZONE 'America/Vancouver')::date,
  ALTER COLUMN actual_end_date      TYPE DATE USING (actual_end_date AT TIME ZONE 'America/Vancouver')::date,
  ALTER COLUMN agreement_start_date TYPE DATE USING (agreement_start_date AT TIME ZONE 'America/Vancouver')::date,
  ALTER COLUMN agreement_end_date   TYPE DATE USING (agreement_end_date AT TIME ZONE 'America/Vancouver')::date,
  ALTER COLUMN termination_date     TYPE DATE USING (termination_date AT TIME ZONE 'America/Vancouver')::date;
