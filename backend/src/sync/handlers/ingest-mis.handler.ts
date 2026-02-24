import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobsService } from 'src/jobs/jobs.service'
import { MisService } from '../mis/mis.service'

// Fetches MIS data using full reload (truncate + COPY FROM STDIN)
// Skips reload when last_updated value matches the previous successful run
// To force a reload, update or delete the metadata of the last successful INGEST_MIS job run
@Injectable()
export class IngestMisHandler extends BaseJob {
  readonly jobType = JobType.INGEST_MIS

  constructor(
    private readonly misService: MisService,
    private readonly jobsService: JobsService,
  ) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    const lastUpdated = await this.misService.readLastUpdated()

    if (lastUpdated) {
      const previousRun = await this.jobsService.getLastSuccessfulJob(JobType.INGEST_MIS)
      const previousLastUpdated = (previousRun?.metadata as Record<string, unknown>)?.lastUpdated

      if (previousLastUpdated === lastUpdated) {
        this.logger.log(`MIS data unchanged (lastUpdated: ${lastUpdated}), skipping reload`)
        return {
          success: true,
          message: `MIS ingestion skipped: data unchanged (lastUpdated: ${lastUpdated})`,
          metadata: {
            lastUpdated,
            skipped: true,
            totalRows: 0,
          },
        }
      }
    }

    const files = await this.misService.ingestAll()
    const totalRows = files.reduce((sum, r) => sum + r.rows, 0)

    return {
      success: true,
      message: `MIS ingestion complete: ${totalRows} rows loaded across ${files.length} files (lastUpdated: ${lastUpdated ?? 'unknown'})`,
      metadata: {
        lastUpdated,
        results: files,
        totalRows,
      },
    }
  }
}
