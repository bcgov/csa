import { describe, it, expect, vi } from 'vitest'
import { JobActivityAggregator } from './job-activity-aggregator'
import { JobActivitySeverity } from './enums/job-activity-severity.enum'
import { JobActivityType } from './enums/job-activity-type.enum'

describe('JobActivityAggregator', () => {
  it('should flush a single occurrence unchanged', async () => {
    const aggregator = new JobActivityAggregator()
    const recordFn = vi.fn().mockResolvedValue(undefined)

    aggregator.note({
      severity: JobActivitySeverity.WARNING,
      activityType: JobActivityType.CRA,
      related: 'Invalid response file format (example: bad.rsp)',
      aggregateKey: 'invalid-response-file-format',
    })

    await aggregator.flush(recordFn)

    expect(recordFn).toHaveBeenCalledWith({
      severity: JobActivitySeverity.WARNING,
      activityType: JobActivityType.CRA,
      related: 'Invalid response file format (example: bad.rsp)',
    })
  })

  it('should aggregate multiple notes into one row', async () => {
    const aggregator = new JobActivityAggregator()
    const recordFn = vi.fn().mockResolvedValue(undefined)

    aggregator.note({
      severity: JobActivitySeverity.WARNING,
      activityType: JobActivityType.WKL,
      related: 'Unexpected WKL transaction type (example: 99)',
      aggregateKey: 'wkl-unexpected-transaction',
    })
    aggregator.note({
      severity: JobActivitySeverity.WARNING,
      activityType: JobActivityType.WKL,
      related: 'Unexpected WKL transaction type (example: 99)',
      aggregateKey: 'wkl-unexpected-transaction',
    })

    await aggregator.flush(recordFn)

    expect(recordFn).toHaveBeenCalledOnce()
    expect(recordFn).toHaveBeenCalledWith({
      severity: JobActivitySeverity.WARNING,
      activityType: JobActivityType.WKL,
      related: '2 occurrences — Unexpected WKL transaction type (example: 99)',
    })
  })
})
