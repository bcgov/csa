import { JobActivitySeverity } from './enums/job-activity-severity.enum'
import { JobActivityType } from './enums/job-activity-type.enum'
import {
  getCurrentJobRunId,
  getJobActivityAggregator,
  runWithJobScope,
  trackPendingActivityWrite,
  flushPendingActivityWrites,
} from './job-execution.scope'

export type JobMonitoringLogMeta = {
  activityType?: JobActivityType
  category?: string
  related?: string
  aggregate?: boolean
  aggregateKey?: string
}

const CATEGORY_TO_ACTIVITY_TYPE: Record<string, JobActivityType> = {
  DATA_QUALITY: JobActivityType.DATA_QUALITY,
  JOB: JobActivityType.JOB,
  CRA: JobActivityType.CRA,
  WKL: JobActivityType.WKL,
  ICM: JobActivityType.ICM,
  BATCH: JobActivityType.BATCH,
}

type RecordActivityFn = (params: {
  jobRunId: number | null
  severity: JobActivitySeverity
  activityType: JobActivityType
  related?: string
}) => Promise<void>

let recordActivityFn: RecordActivityFn | null = null

export function registerJobActivityRecorder(fn: RecordActivityFn): void {
  recordActivityFn = fn
}

/** @internal test helper */
export function resetJobActivityRecorder(): void {
  recordActivityFn = null
}

export function resolveActivityType(meta: JobMonitoringLogMeta): JobActivityType | undefined {
  if (meta.activityType) {
    return meta.activityType
  }

  if (meta.category) {
    return CATEGORY_TO_ACTIVITY_TYPE[meta.category]
  }

  return undefined
}

export function mapLogLevelToSeverity(
  level: 'warn' | 'error' | 'crit' | 'alert',
): JobActivitySeverity {
  switch (level) {
    case 'warn':
      return JobActivitySeverity.WARNING
    case 'error':
      return JobActivitySeverity.ERROR
    case 'crit':
    case 'alert':
      return JobActivitySeverity.CRITICAL
  }
}

async function writeActivity(params: {
  jobRunId: number | null
  severity: JobActivitySeverity
  activityType: JobActivityType
  related?: string
}): Promise<void> {
  if (!recordActivityFn) {
    return
  }

  try {
    await recordActivityFn(params)
  } catch {
    // Activity logging must not fail job execution.
  }
}

function queueImmediateActivity(params: {
  jobRunId: number | null
  severity: JobActivitySeverity
  activityType: JobActivityType
  related: string
}): void {
  trackPendingActivityWrite(writeActivity(params))
}

export async function persistJobMonitoringLog(
  level: 'warn' | 'error' | 'crit' | 'alert',
  message: string,
  meta?: JobMonitoringLogMeta,
  explicitJobRunId?: number | null,
): Promise<void> {
  if (!meta) {
    return
  }

  const activityType = resolveActivityType(meta)
  if (!activityType) {
    return
  }

  const jobRunId =
    explicitJobRunId !== undefined ? explicitJobRunId : (getCurrentJobRunId() ?? null)

  const severity = mapLogLevelToSeverity(level)
  const related = (meta.related ?? message).slice(0, 512)
  const shouldAggregate = meta.aggregate ?? (level === 'crit' && !!meta.category)

  if (shouldAggregate) {
    const aggregator = getJobActivityAggregator()
    if (aggregator) {
      aggregator.note({
        severity,
        activityType,
        related,
        aggregateKey: meta.aggregateKey ?? `${severity}:${activityType}`,
      })
      return
    }
  }

  queueImmediateActivity({ jobRunId, severity, activityType, related })
}

export async function flushJobMonitoringAggregates(): Promise<void> {
  const aggregator = getJobActivityAggregator()
  const jobRunId = getCurrentJobRunId() ?? null

  if (!aggregator || aggregator.size === 0) {
    return
  }

  await aggregator.flush(async (bucket) => {
    await writeActivity({
      jobRunId,
      severity: bucket.severity,
      activityType: bucket.activityType,
      related: bucket.related,
    })
  })
}

export async function runWithJobExecutionScope<T>(
  jobRunId: number,
  fn: () => Promise<T>,
): Promise<T> {
  return runWithJobScope(jobRunId, async () => {
    try {
      return await fn()
    } finally {
      await flushPendingActivityWrites()
      await flushJobMonitoringAggregates()
    }
  })
}
