import { JobActivitySeverity } from './enums/job-activity-severity.enum'
import { JobActivityType } from './enums/job-activity-type.enum'

type ActivityBucket = {
  severity: JobActivitySeverity
  activityType: JobActivityType
  count: number
  sampleRelated: string
}

export class JobActivityAggregator {
  private readonly buckets = new Map<string, ActivityBucket>()

  note(params: {
    severity: JobActivitySeverity
    activityType: JobActivityType
    related: string
    aggregateKey: string
  }): void {
    const existing = this.buckets.get(params.aggregateKey)
    if (existing) {
      existing.count += 1
      return
    }

    this.buckets.set(params.aggregateKey, {
      severity: params.severity,
      activityType: params.activityType,
      count: 1,
      sampleRelated: params.related,
    })
  }

  async flush(
    recordFn: (params: {
      severity: JobActivitySeverity
      activityType: JobActivityType
      related: string
    }) => Promise<void>,
  ): Promise<void> {
    for (const bucket of this.buckets.values()) {
      const related =
        bucket.count === 1
          ? bucket.sampleRelated
          : `${bucket.count} occurrences — ${bucket.sampleRelated}`

      await recordFn({
        severity: bucket.severity,
        activityType: bucket.activityType,
        related: related.slice(0, 512),
      })
    }

    this.buckets.clear()
  }

  get size(): number {
    return this.buckets.size
  }
}
