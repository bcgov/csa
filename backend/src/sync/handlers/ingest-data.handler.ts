import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobRunner } from 'src/jobs/job-runner.service'

/*
 * Fetches data from ICM and MIS into staging tables.
 * Does not run eligibility or sync-back — those are independent jobs.
 */
@Injectable()
export class IngestDataHandler extends BaseJob {
  readonly jobType = JobType.INGEST_DATA
  readonly inlineRetryAttempts = 0 // Orchestrator: children handle their own retries

  constructor(private readonly jobRunner: JobRunner) {
    super()
  }

  async execute(context: JobContext): Promise<JobResult> {
    const parentJobId = context.jobRunId

    this.logger.log('Starting parallel ingestion from ICM and MIS...')
    const [icmResult, misResult] = await Promise.all([
      this.jobRunner.runJobType(JobType.INGEST_ICM, JobTrigger.CRON, { parentJobId }),
      this.jobRunner.runJobType(JobType.INGEST_MIS, JobTrigger.CRON, { parentJobId }),
    ])

    if (!icmResult.success || !misResult.success) {
      return {
        success: false,
        message: 'Ingestion failed',
        metadata: { icmResult, misResult },
      }
    }

    return {
      success: true,
      message: 'Data ingestion completed successfully',
      metadata: { icmResult, misResult },
    }
  }
}
