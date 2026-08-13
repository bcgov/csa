import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobActivityType } from 'src/jobs/enums/job-activity-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { IcmSyncBackService } from '../icm/icm-sync-back.service'

/*
 * Standalone sync handler — not invoked by other handlers.
 * All workflows use inline syncFlaggedWithRetry() instead.
 * Kept for manual/END_USER-triggered sync if needed.
 */
@Injectable()
export class SyncIcmHandler extends BaseJob {
  readonly jobType = JobType.SYNC_ICM

  constructor(private readonly icmSyncBackService: IcmSyncBackService) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    const hasFlagged = await this.icmSyncBackService.hasFlaggedContacts()
    if (!hasFlagged) {
      return {
        success: true,
        message: 'No contacts flagged for ICM sync',
        metadata: { totalFlagged: 0, synced: 0, failed: 0, chunks: 0 },
      }
    }

    const result = await this.icmSyncBackService.syncFlaggedContacts()

    if (result.failed > 0 && result.synced === 0) {
      this.logger.error(`ICM sync failed: all ${result.failed} contacts failed`, {
        activityType: JobActivityType.ICM,
        related: `ICM sync failed: all ${result.failed} contacts failed`,
      })
      return {
        success: false,
        message: `ICM sync failed: all ${result.failed} contacts failed`,
        metadata: { ...result },
      }
    }

    if (result.failed > 0) {
      this.logger.warn(
        `ICM sync partial failure: ${result.synced} synced, ${result.failed} failed`,
        {
          activityType: JobActivityType.ICM,
          related: `ICM sync partial failure (${result.synced} synced, ${result.failed} failed)`,
        },
      )
    }

    return {
      success: true,
      message: `ICM sync complete: ${result.synced} synced, ${result.failed} failed`,
      metadata: { ...result },
    }
  }
}
