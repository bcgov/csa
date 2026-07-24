-- Allow monitoring activities that are not tied to a specific job run (e.g. WKL reprocess).

ALTER TABLE csa.job_activities
  DROP CONSTRAINT IF EXISTS job_activities_job_run_id_fkey;

ALTER TABLE csa.job_activities
  ALTER COLUMN job_run_id DROP NOT NULL;

ALTER TABLE csa.job_activities
  ADD CONSTRAINT job_activities_job_run_id_fkey
  FOREIGN KEY (job_run_id) REFERENCES csa.job_runs(id) ON DELETE SET NULL;

COMMENT ON COLUMN csa.job_activities.job_run_id IS
  'Associated job run when the activity occurred during a job; NULL for standalone operator actions';
