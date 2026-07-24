import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { JobActivitySeverity } from './enums/job-activity-severity.enum'
import { JobActivityType } from './enums/job-activity-type.enum'
import { runWithJobScope } from './job-execution.scope'
import {
  flushJobMonitoringAggregates,
  persistJobMonitoringLog,
  registerJobActivityRecorder,
  resetJobActivityRecorder,
  runWithJobExecutionScope,
} from './job-monitoring-log'

describe('job-monitoring-log', () => {
  const recordActivity = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    recordActivity.mockClear()
    registerJobActivityRecorder(recordActivity)
  })

  afterEach(() => {
    resetJobActivityRecorder()
  })

  it('should write immediately when activityType is set', async () => {
    await runWithJobExecutionScope(42, async () => {
      await persistJobMonitoringLog('warn', 'ICM sync-back failed', {
        activityType: JobActivityType.ICM,
        related: 'ICM sync-back failed: timeout',
      })
    })

    expect(recordActivity).toHaveBeenCalledWith({
      jobRunId: 42,
      severity: JobActivitySeverity.WARNING,
      activityType: JobActivityType.ICM,
      related: 'ICM sync-back failed: timeout',
    })
  })

  it('should aggregate category-tagged crit logs and flush at job end', async () => {
    await runWithJobExecutionScope(7, async () => {
      await persistJobMonitoringLog('crit', 'Skipping contact: empty/null in required fields [dob]', {
        category: 'DATA_QUALITY',
      })
      await persistJobMonitoringLog('crit', 'Skipping contact: empty/null in required fields [name]', {
        category: 'DATA_QUALITY',
      })
    })

    expect(recordActivity).toHaveBeenCalledOnce()
    expect(recordActivity).toHaveBeenCalledWith({
      jobRunId: 7,
      severity: JobActivitySeverity.CRITICAL,
      activityType: JobActivityType.DATA_QUALITY,
      related: '2 occurrences — Skipping contact: empty/null in required fields [dob]',
    })
  })

  it('should no-op when no recorder is registered', async () => {
    resetJobActivityRecorder()

    await runWithJobScope(1, async () => {
      await persistJobMonitoringLog('error', 'Job failed', {
        activityType: JobActivityType.JOB,
      })
      await flushJobMonitoringAggregates()
    })

    expect(recordActivity).not.toHaveBeenCalled()
  })
})
