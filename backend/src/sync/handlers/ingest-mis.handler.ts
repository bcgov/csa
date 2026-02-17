import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { MisService } from '../mis/mis.service'

// Fetches MIS data using full reload (truncate + COPY FROM STDIN)
@Injectable()
export class IngestMisHandler extends BaseJob {
  readonly jobType = JobType.INGEST_MIS

  constructor(private readonly misService: MisService) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    const results = await this.misService.ingestAll()

    const totalRows = results.reduce((sum, r) => sum + r.rows, 0)

    return {
      success: true,
      message: `MIS ingestion complete: ${totalRows} rows loaded across ${results.length} files`,
      metadata: {
        results,
        totalRows,
      },
    }
  }
}
