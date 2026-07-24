-- VW-02 Job Monitoring: user IDIR and activity log.

ALTER TABLE csa.job_runs
  ADD COLUMN IF NOT EXISTS triggered_by_user TEXT;

COMMENT ON COLUMN csa.job_runs.triggered_by_user IS
  'IDIR username when job_trigger is END_USER; NULL for CRON/SYSTEM jobs';

-- Activity log table for job-level monitoring details.
CREATE TABLE IF NOT EXISTS csa.job_activities (
  id SERIAL PRIMARY KEY,
  job_run_id INTEGER NOT NULL REFERENCES csa.job_runs(id) ON DELETE CASCADE,
  "when" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity TEXT NOT NULL,
  type TEXT NOT NULL,
  related TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_runs_created_at_desc
  ON csa.job_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_activities_job_run_id_when
  ON csa.job_activities (job_run_id, "when" DESC);

CREATE INDEX IF NOT EXISTS idx_job_activities_severity
  ON csa.job_activities (severity);

CREATE INDEX IF NOT EXISTS idx_job_activities_type
  ON csa.job_activities (type);
