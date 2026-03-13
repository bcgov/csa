import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobTrigger } from 'src/jobs/enums/job-trigger.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobRunner } from 'src/jobs/job-runner.service'
import { IcmSyncBackService } from '../icm/icm-sync-back.service'

/*
 * Orchestrates the complete data sync flow:
 * 1. INGEST_ICM + INGEST_MIS
 * 2. RUN_ELIGIBILITY (after ingestion complete)
 * 3. SYNC_ICM (after eligibility)
 */
@Injectable()
export class IngestDataHandler extends BaseJob {
  readonly jobType = JobType.INGEST_DATA
  readonly inlineRetryAttempts = 0 // Orchestrator: children handle their own retries

  constructor(
    private readonly jobRunner: JobRunner,
    private readonly icmSyncBackService: IcmSyncBackService,
  ) {
    super()
  }

  async execute(context: JobContext): Promise<JobResult> {
    const parentJobId = context.jobRunId

    try {
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

      this.logger.log('Running eligibility processing...')
      const eligibilityResult = await this.jobRunner.runJobType(
        JobType.RUN_ELIGIBILITY,
        JobTrigger.CRON,
        { parentJobId },
      )

      if (!eligibilityResult.success) {
        return {
          success: false,
          message: 'Eligibility processing failed',
          metadata: { eligibilityResult },
        }
      }

      let syncResult: JobResult | null = null
      if (await this.icmSyncBackService.hasFlaggedContacts()) {
        this.logger.log('Syncing flagged contacts back to ICM...')
        try {
          syncResult = await this.jobRunner.runJobType(JobType.SYNC_ICM, JobTrigger.SYSTEM, {
            parentJobId,
          })

          if (!syncResult.success) {
            this.logger.warn(
              `ICM sync-back failed: ${syncResult.message}. Retry will pick up flagged contacts.`,
            )
          }
        } catch (err) {
          this.logger.warn(`ICM sync-back failed: ${(err as Error).message}`)
        }
      } else {
        this.logger.log('No contacts flagged for ICM sync, skipping')
      }

      return {
        success: true,
        message: 'Data ingestion and eligibility completed successfully',
        metadata: { syncResult },
      }
    } catch (error) {
      this.logger.error(`Unexpected error in INGEST_DATA: ${error.message}`, error.stack)
      return {
        success: false,
        message: error.message,
        metadata: {
          errorStack: error.stack,
          errorName: error.name,
        },
      }
    }
  }
}
