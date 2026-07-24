import { JobStatus } from './enums/job-status.enum'
import { JobTrigger } from './enums/job-trigger.enum'
import { JobType } from './enums/job-type.enum'
import {
  formatJobDisplayName,
  formatJobSummary,
  formatMonitoringStatus,
  formatTriggeredBy,
  MONITORED_JOB_HISTORY_TYPES,
  MONITORED_JOB_LIST_TYPES,
} from './job-monitoring.utils'

describe('job-monitoring.utils', () => {
  it('lists six FDD job types for the job list', () => {
    expect(MONITORED_JOB_HISTORY_TYPES).toHaveLength(13)
    expect(MONITORED_JOB_LIST_TYPES).toEqual([
      JobType.INGEST_ICM,
      JobType.INGEST_MIS,
      JobType.RUN_ELIGIBILITY,
      JobType.AUTO_BATCH,
      JobType.SEND_CRA_FILE,
      JobType.POLL_CRA_RESPONSE,
    ])
  })

  it('maps job types to display names', () => {
    expect(formatJobDisplayName(JobType.INGEST_ICM)).toBe('Data Fetch - ICM')
    expect(formatJobDisplayName(JobType.RUN_ELIGIBILITY)).toBe('Eligibility')
  })

  it('maps job status to FDD labels', () => {
    expect(formatMonitoringStatus(JobStatus.SUCCESS)).toBe('Success')
    expect(formatMonitoringStatus(JobStatus.RUNNING)).toBe('Running')
    expect(formatMonitoringStatus(JobStatus.FAILED)).toBe('Failed')
  })

  it('returns IDIR for end-user jobs and SYSTEM otherwise', () => {
    expect(
      formatTriggeredBy({ jobTrigger: JobTrigger.END_USER, triggeredByUser: 'jsmith' }),
    ).toBe('JSMITH')
    expect(formatTriggeredBy({ jobTrigger: JobTrigger.CRON, triggeredByUser: null })).toBe('SYSTEM')
  })

  it('returns Job failed for failed runs', () => {
    expect(
      formatJobSummary({
        jobType: JobType.SEND_CRA_FILE,
        status: JobStatus.FAILED,
        metadata: null,
      }),
    ).toBe('Job failed')
  })

  it('returns null for running jobs', () => {
    expect(
      formatJobSummary({
        jobType: JobType.RUN_ELIGIBILITY,
        status: JobStatus.RUNNING,
        metadata: { processed: 1 },
      }),
    ).toBeNull()
  })

  it('formats eligibility summary from metadata', () => {
    expect(
      formatJobSummary({
        jobType: JobType.RUN_ELIGIBILITY,
        status: JobStatus.SUCCESS,
        metadata: { processed: 10, statusChanges: 2, newContacts: 1, skipped: 3 },
      }),
    ).toBe('10 processed, 2 updated, 1 new, 3 skipped')
  })

  it('formats ICM ingestion summary from metadata', () => {
    expect(
      formatJobSummary({
        jobType: JobType.INGEST_ICM,
        status: JobStatus.SUCCESS,
        metadata: { totalFetched: 100, totalUpserted: 95 },
      }),
    ).toBe('100 fetched, 95 upserted')
  })

  it('formats MIS ingestion summary from metadata', () => {
    expect(
      formatJobSummary({
        jobType: JobType.INGEST_MIS,
        status: JobStatus.SUCCESS,
        metadata: { totalRows: 500, results: [{}, {}, {}] },
      }),
    ).toBe('500 rows loaded across 3 files')
  })

  it('formats auto-batch summary from metadata', () => {
    expect(
      formatJobSummary({
        jobType: JobType.AUTO_BATCH,
        status: JobStatus.SUCCESS,
        metadata: { application: 4, cancellation: 2 },
      }),
    ).toBe('4 application, 2 cancellation')
  })

  it('formats weekly response summary from metadata', () => {
    expect(
      formatJobSummary({
        jobType: JobType.POLL_CRA_RESPONSE,
        status: JobStatus.SUCCESS,
        metadata: { files_processed: 2, records_accepted: 10, records_rejected: 1 },
      }),
    ).toBe('2 files processed, 10 accepted, 1 rejected')
  })

  it('formats send CRA no-batch summary from metadata', () => {
    expect(
      formatJobSummary({
        jobType: JobType.SEND_CRA_FILE,
        status: JobStatus.SUCCESS,
        metadata: { no_batch: true },
      }),
    ).toBe('No batch to process')
  })

  it('formats ingest data summary from child job metadata', () => {
    expect(
      formatJobSummary({
        jobType: JobType.INGEST_DATA,
        status: JobStatus.SUCCESS,
        metadata: {
          icmResult: { success: true, metadata: { totalFetched: 50, totalUpserted: 48 } },
          misResult: { success: true, metadata: { totalRows: 200, results: [{}, {}] } },
        },
      }),
    ).toBe('ICM: 50 fetched, 48 upserted; MIS: 200 rows, 2 files')
  })
})
