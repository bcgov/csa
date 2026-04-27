import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { IcmSyncBackService, SyncBackResult } from '../icm/icm-sync-back.service'
import { EligibilityService } from '../eligibility/eligibility.service'

/*
 * Runs eligibility rules against staged data, then syncs flagged contacts back to ICM.
 * Triggered independently via entrypoint or API — not chained from INGEST_DATA.
 */
@Injectable()
export class RunEligibilityHandler extends BaseJob {
  readonly jobType = JobType.RUN_ELIGIBILITY

  constructor(
    private readonly eligibilityService: EligibilityService,
    private readonly icmSyncBackService: IcmSyncBackService,
  ) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    const result = await this.eligibilityService.run()

    let syncResult: SyncBackResult | null = null
    try {
      syncResult = await this.icmSyncBackService.syncFlaggedWithRetry()
    } catch (err) {
      this.logger.warn(`ICM sync-back failed: ${(err as Error).message}`)
    }

    return {
      success: true,
      message: `Eligibility complete: ${result.processed} processed, ${result.statusChanges} updated, ${result.newContacts} new, ${result.skipped} skipped`,
      metadata: { ...(result as unknown as Record<string, unknown>), syncResult },
    }
  }
}
