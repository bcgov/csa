import { Injectable } from '@nestjs/common'
import { JobActivitySeverity } from './enums/job-activity-severity.enum'
import { JobActivityType } from './enums/job-activity-type.enum'
import { JobsService } from './jobs.service'

const MAX_RELATED_LENGTH = 512

@Injectable()
export class JobActivityService {
  constructor(private readonly jobsService: JobsService) {}

  async recordActivity(params: {
    jobRunId: number | null
    severity: JobActivitySeverity
    activityType: JobActivityType
    related?: string
  }): Promise<void> {
    await this.jobsService.addActivity(params.jobRunId, {
      severity: params.severity,
      type: params.activityType,
      related: params.related?.slice(0, MAX_RELATED_LENGTH),
    })
  }
}
