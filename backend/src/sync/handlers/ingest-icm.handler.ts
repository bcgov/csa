import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobsService } from 'src/jobs/jobs.service'

// Fetches ICM Data using incremental sync
@Injectable()
export class IngestIcmHandler extends BaseJob {
  readonly jobType = JobType.INGEST_ICM

  constructor(private readonly jobsService: JobsService) {
    super()
  }

  async execute(context: JobContext): Promise<JobResult> {
    // TODO: Implement ICM ingestion logic
    // 1. Get last_update_at: await jobsService.getLastSuccessTimestamp(JobType.INGEST_DATA)
    // 2. Fetch records from ICM API where modified_at > last_update_at
    // 3. Upsert into local database
    // 4. Return metadata: { records_fetched, last_update_at_used }

    this.logger.log('INGEST_ICM stub - not yet implemented')

    return {
      success: true,
      message: 'ICM ingestion stub',
      metadata: {
        records_fetched: 0,
        last_update_at_used: null,
      },
    }
  }
}
