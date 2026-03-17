import { Injectable } from '@nestjs/common'
import { IcmSyncBackService, SyncBackResult } from 'src/sync/icm/icm-sync-back.service'
import { BaseJob } from '../base-job'
import { JobType } from '../enums/job-type.enum'
import { JobResult } from '../interfaces/job-result.interface'
import { JobContext } from '../interfaces/job.interface'
import { JobRunner } from '../job-runner.service'

/*
 * RETRY_FAILED - Retry failed jobs and sweep flagged contacts
 * 1. Marks stuck RUNNING jobs as FAILED
 * 2. Retries all FAILED jobs
 * 3. Syncs any remaining flagged contacts to ICM
 */
@Injectable()
export class RetryFailedHandler extends BaseJob {
  readonly jobType = JobType.RETRY_FAILED

  constructor(
    private readonly jobRunner: JobRunner,
    private readonly icmSyncBackService: IcmSyncBackService,
  ) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    try {
      await this.jobRunner.processFailedJobs()

      let syncResult: SyncBackResult | null = null
      if (await this.icmSyncBackService.hasFlaggedContacts()) {
        this.logger.log('Sweeping remaining flagged contacts to ICM...')
        syncResult = await this.icmSyncBackService.syncFlaggedContacts()

        if (syncResult.failed > 0) {
          this.logger.warn(
            `ICM sweep partial failure: ${syncResult.synced} synced, ${syncResult.failed} failed`,
          )
        }
      }

      return {
        success: true,
        message: 'Failed job processing completed',
        metadata: { syncResult },
      }
    } catch (error) {
      this.logger.error(`Error processing failed jobs: ${error.message}`, error.stack)
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
