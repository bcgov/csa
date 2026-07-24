import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobActivityType } from 'src/jobs/enums/job-activity-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { IcmSyncBackService, SyncBackResult } from '../icm/icm-sync-back.service'
import { AutoBatchService } from '../eligibility/auto-batch.service'

/*
 * Finds eligible contacts, adds them via BatchesService (same as UI), then syncs
 * flagged statuses back to ICM. Triggered independently — decoupled from eligibility.
 */
@Injectable()
export class AutoBatchHandler extends BaseJob {
  readonly jobType = JobType.AUTO_BATCH

  constructor(
    private readonly autoBatchService: AutoBatchService,
    private readonly icmSyncBackService: IcmSyncBackService,
  ) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    const result = await this.autoBatchService.run()

    let syncResult: SyncBackResult | null = null
    if (result.application > 0 || result.cancellation > 0) {
      try {
        syncResult = await this.icmSyncBackService.syncFlaggedWithRetry()
      } catch (err) {
        this.logger.activityWarn(`ICM sync-back failed: ${(err as Error).message}`, {
          activityType: JobActivityType.ICM,
          related: `ICM sync-back failed: ${(err as Error).message}`,
        })
      }
    }

    return {
      success: true,
      message: `Auto-batch complete: ${result.application} application, ${result.cancellation} cancellation`,
      metadata: { ...result, syncResult } as unknown as Record<string, unknown>,
    }
  }
}
