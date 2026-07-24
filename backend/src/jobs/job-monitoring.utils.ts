import { JobStatus } from './enums/job-status.enum'
import { JobTrigger } from './enums/job-trigger.enum'
import { JobType } from './enums/job-type.enum'

/** FDD Job List (APL-10) — one row per type; ICM/MIS are child ingestion runs. */
export const MONITORED_JOB_LIST_TYPES: JobType[] = [
  JobType.INGEST_ICM,
  JobType.INGEST_MIS,
  JobType.RUN_ELIGIBILITY,
  JobType.AUTO_BATCH,
  JobType.SEND_CRA_FILE,
  JobType.POLL_CRA_RESPONSE,
]

/** Ingestion child jobs — latest run is not filtered by parentJobId. */
export const MONITORED_CHILD_JOB_TYPES: JobType[] = [JobType.INGEST_ICM, JobType.INGEST_MIS]

/** FDD Job History (APL-11) — list types plus orchestrator, sync, retry, and backfills. */
export const MONITORED_JOB_HISTORY_TYPES: JobType[] = [
  ...MONITORED_JOB_LIST_TYPES,
  JobType.INGEST_DATA,
  JobType.SYNC_ICM,
  JobType.RETRY_FAILED,
  JobType.BACKFILL_OOC_AGREEMENT_LINES,
  JobType.BACKFILL_ICM_CASE_CLOSE_DATES,
  JobType.BACKFILL_WKL_FILE_RECORDS,
  JobType.BACKFILL_BATCH_EFFECTIVE_DATE_REASON,
]

export const JOB_DISPLAY_NAMES: Record<string, string> = {
  [JobType.INGEST_DATA]: 'Data Fetch',
  [JobType.INGEST_MIS]: 'Data Fetch - MIS',
  [JobType.INGEST_ICM]: 'Data Fetch - ICM',
  [JobType.RUN_ELIGIBILITY]: 'Eligibility',
  [JobType.AUTO_BATCH]: 'Auto Batch',
  [JobType.SEND_CRA_FILE]: 'Send CRA File',
  [JobType.POLL_CRA_RESPONSE]: 'Weekly Response',
  [JobType.SYNC_ICM]: 'ICM Sync-Back',
  [JobType.RETRY_FAILED]: 'Retry Failed Jobs',
}

const MONITORING_STATUS_LABELS: Record<string, string> = {
  [JobStatus.SUCCESS]: 'Success',
  [JobStatus.RUNNING]: 'Running',
  [JobStatus.FAILED]: 'Failed',
}

export type JobRunForMonitoring = {
  jobType: string
  jobTrigger: string
  triggeredByUser?: string | null
  status: string
  metadata?: unknown
}

export function formatJobDisplayName(jobType: string): string {
  return JOB_DISPLAY_NAMES[jobType] ?? jobType
}

export function formatMonitoringStatus(status: string): string {
  return MONITORING_STATUS_LABELS[status] ?? status
}

export function formatTriggeredBy(
  job: Pick<JobRunForMonitoring, 'jobTrigger' | 'triggeredByUser'>,
): string {
  if (job.jobTrigger === JobTrigger.END_USER && job.triggeredByUser) {
    return job.triggeredByUser.toUpperCase()
  }
  return 'SYSTEM'
}

export function formatJobSummary(
  job: Pick<JobRunForMonitoring, 'jobType' | 'status' | 'metadata'>,
): string | null {
  if (job.status === JobStatus.FAILED) {
    return 'Job failed'
  }

  if (job.status === JobStatus.RUNNING) {
    return null
  }

  const metadata = (job.metadata as Record<string, unknown> | null) ?? null
  if (!metadata) {
    return null
  }

  switch (job.jobType) {
    case JobType.INGEST_ICM: {
      const fetched = metadata.totalFetched ?? metadata.fetched
      const upserted = metadata.totalUpserted ?? metadata.upserted
      if (fetched !== undefined && upserted !== undefined) {
        return `${fetched} fetched, ${upserted} upserted`
      }
      break
    }
    case JobType.INGEST_MIS: {
      const totalRows = metadata.totalRows
      const fileCount = Array.isArray(metadata.results) ? metadata.results.length : undefined
      if (totalRows !== undefined && fileCount !== undefined) {
        return `${totalRows} rows loaded across ${fileCount} files`
      }
      break
    }
    case JobType.RUN_ELIGIBILITY: {
      const processed = metadata.processed
      const updated = metadata.statusChanges ?? metadata.updated
      const newContacts = metadata.newContacts ?? metadata.new
      const skipped = metadata.skipped
      if (processed !== undefined) {
        return `${processed} processed, ${updated ?? 0} updated, ${newContacts ?? 0} new, ${skipped ?? 0} skipped`
      }
      break
    }
    case JobType.AUTO_BATCH: {
      const application = metadata.application
      const cancellation = metadata.cancellation
      if (application !== undefined && cancellation !== undefined) {
        return `${application} application, ${cancellation} cancellation`
      }
      break
    }
    case JobType.SEND_CRA_FILE: {
      if (metadata.no_batch === true) {
        return 'No batch to process'
      }
      const batchId = metadata.batch_id
      const recordCount = metadata.record_count
      const contactsCount = metadata.contacts_count
      if (batchId !== undefined) {
        return `Batch ${batchId}, ${recordCount ?? 0} records, ${contactsCount ?? 0} contacts`
      }
      break
    }
    case JobType.POLL_CRA_RESPONSE: {
      const filesProcessed = metadata.files_processed
      if (filesProcessed !== undefined) {
        if (filesProcessed === 0) {
          return 'No new CRA response files to process'
        }
        const accepted = metadata.records_accepted ?? 0
        const rejected = metadata.records_rejected ?? 0
        return `${filesProcessed} files processed, ${accepted} accepted, ${rejected} rejected`
      }
      break
    }
    case JobType.SYNC_ICM: {
      if (metadata.totalFlagged === 0) {
        return 'No contacts flagged for ICM sync'
      }
      const synced = metadata.synced
      const failed = metadata.failed
      if (synced !== undefined || failed !== undefined) {
        return `${synced ?? 0} synced, ${failed ?? 0} failed`
      }
      break
    }
    case JobType.RETRY_FAILED: {
      const syncResult = metadata.syncResult as Record<string, unknown> | null | undefined
      if (syncResult && (syncResult.synced !== undefined || syncResult.failed !== undefined)) {
        return `${syncResult.synced ?? 0} synced, ${syncResult.failed ?? 0} failed`
      }
      return 'Failed job processing completed'
    }
    case JobType.INGEST_DATA: {
      const icm = metadata.icmResult as { metadata?: Record<string, unknown> } | undefined
      const mis = metadata.misResult as { metadata?: Record<string, unknown> } | undefined
      const parts: string[] = []

      const icmFetched = icm?.metadata?.totalFetched
      const icmUpserted = icm?.metadata?.totalUpserted
      if (icmFetched !== undefined && icmUpserted !== undefined) {
        parts.push(`ICM: ${icmFetched} fetched, ${icmUpserted} upserted`)
      }

      const misRows = mis?.metadata?.totalRows
      const misFileCount = Array.isArray(mis?.metadata?.results)
        ? mis.metadata.results.length
        : undefined
      if (misRows !== undefined && misFileCount !== undefined) {
        parts.push(`MIS: ${misRows} rows, ${misFileCount} files`)
      }

      if (parts.length > 0) {
        return parts.join('; ')
      }

      if (metadata.icmResult && metadata.misResult) {
        return 'Data ingestion completed successfully'
      }
      break
    }
    default:
      break
  }

  return null
}

export function isMonitoredChildJobType(jobType: JobType): boolean {
  return MONITORED_CHILD_JOB_TYPES.includes(jobType)
}
