import { JobStatus } from 'src/jobs/enums/job-status.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import {
  OpenshiftJobLauncher,
  type OpenshiftJobState,
} from 'src/jobs/openshift-job-launcher.service'

/** Matches retry-failed stuck reconciliation (job-runner.service.ts). */
export const JOB_STUCK_THRESHOLD_MINUTES = 40

/** Avoid false alarms while the OpenShift Job is still being created. */
export const OPENSHIFT_STATUS_CHECK_GRACE_MS = 2 * 60 * 1000

const OPENSHIFT_STATUS_CACHE_TTL_MS = 30_000

const statusCache = new Map<
  string,
  { expiresAt: number; state: OpenshiftJobState; message: string }
>()

export function clearOpenshiftStatusCacheForTests(): void {
  statusCache.clear()
}

export function minutesUntilStuckMark(createdAt: Date, nowMs: number = Date.now()): number {
  const elapsedMs = nowMs - createdAt.getTime()
  const thresholdMs = JOB_STUCK_THRESHOLD_MINUTES * 60 * 1000
  const remainingMs = Math.max(0, thresholdMs - elapsedMs)
  return Math.ceil(remainingMs / (60 * 1000))
}

export function buildStuckRecoverySuffix(createdAt: Date, nowMs: number = Date.now()): string {
  const minutesLeft = minutesUntilStuckMark(createdAt, nowMs)

  if (minutesLeft <= 0) {
    return 'If nothing changes, it will be marked as unsuccessful during the next routine cleanup.'
  }

  if (minutesLeft === 1) {
    return 'If nothing changes, it will be marked as unsuccessful within about 1 minute.'
  }

  return `If nothing changes, it will be marked as unsuccessful within about ${minutesLeft} minutes.`
}

export function buildOpenshiftUserWarning(
  state: OpenshiftJobState,
  createdAt: Date,
  nowMs: number = Date.now(),
): string | undefined {
  const recovery = buildStuckRecoverySuffix(createdAt, nowMs)

  switch (state) {
    case 'NOT_FOUND':
      return `This job does not appear to be running. Contact your administrator if you need help. ${recovery}`
    case 'FAILED':
      return `This job may not complete successfully. ${recovery}`
    case 'COMPLETED':
      return `This job may have already finished, but it is still shown as in progress. ${recovery}`
    default:
      return undefined
  }
}

async function getCachedOpenshiftStatus(
  launcher: OpenshiftJobLauncher,
  jobType: JobType,
  jobId: number,
): Promise<{ state: OpenshiftJobState; message: string }> {
  const key = `${jobType}-${jobId}`
  const cached = statusCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return { state: cached.state, message: cached.message }
  }

  const result = await launcher.getJobStatus(jobType, jobId)
  statusCache.set(key, {
    state: result.state,
    message: result.message,
    expiresAt: Date.now() + OPENSHIFT_STATUS_CACHE_TTL_MS,
  })
  return result
}

type JobForAdvisory = {
  id: number
  jobType: string
  status: string
  createdAt: Date
}

/**
 * Read-only user-facing warning when DB says RUNNING but OpenShift looks unhealthy.
 * Does not update job_runs — retry-failed handles that.
 */
export async function getJobRunWarning(
  job: JobForAdvisory,
  launcher: OpenshiftJobLauncher,
  nowMs: number = Date.now(),
): Promise<string | undefined> {
  if (job.status !== JobStatus.RUNNING) {
    return undefined
  }

  if (!launcher.isEnabled() || !launcher.hasCronJobMapping(job.jobType as JobType)) {
    return undefined
  }

  if (nowMs - job.createdAt.getTime() < OPENSHIFT_STATUS_CHECK_GRACE_MS) {
    return undefined
  }

  const openshiftStatus = await getCachedOpenshiftStatus(
    launcher,
    job.jobType as JobType,
    job.id,
  )

  return buildOpenshiftUserWarning(openshiftStatus.state, job.createdAt, nowMs)
}
