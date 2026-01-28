import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobsService } from 'src/jobs/jobs.service'

// Fetches MIS data using full reload
@Injectable()
export class IngestMisHandler extends BaseJob {
  readonly jobType = JobType.INGEST_MIS

  constructor(private readonly jobsService: JobsService) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    // TODO: Implement MIS ingestion logic

    this.logger.log('INGEST_MIS stub - not yet implemented')

    return {
      success: true,
      message: 'MIS ingestion stub',
      metadata: {
        records_fetched: 0,
        last_updated_at_used: null,
      },
    }
  }
}
