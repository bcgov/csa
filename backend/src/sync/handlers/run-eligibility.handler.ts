import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BaseJob } from 'src/jobs/base-job'
import { JobActivityType } from 'src/jobs/enums/job-activity-type.enum'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobsService } from 'src/jobs/jobs.service'
import { EligibilityService } from '../eligibility/eligibility.service'
import { IcmSyncBackService, SyncBackResult } from '../icm/icm-sync-back.service'

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
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
  ) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    const threshold = await this.computeThreshold()
    const result = await this.eligibilityService.run(threshold)

    if (result.skipped > 0) {
      this.logger.crit(`${result.skipped} contacts skipped (missing required fields)`, {
        activityType: JobActivityType.DATA_QUALITY,
        related: `${result.skipped} contacts skipped (missing required fields)`,
      })
    }

    let syncResult: SyncBackResult | null = null
    try {
      syncResult = await this.icmSyncBackService.syncFlaggedWithRetry()
    } catch (err) {
      this.logger.warn(`ICM sync-back failed: ${(err as Error).message}`, {
        activityType: JobActivityType.ICM,
        related: `ICM sync-back failed: ${(err as Error).message}`,
      })
    }

    if (syncResult && syncResult.failed > 0) {
      this.logger.warn(
        `ICM sync-back partial failure (${syncResult.synced} synced, ${syncResult.failed} failed)`,
        {
          activityType: JobActivityType.ICM,
          related: `ICM sync-back partial failure (${syncResult.synced} synced, ${syncResult.failed} failed)`,
        },
      )
    }

    return {
      success: true,
      message: `Eligibility complete: ${result.processed} processed, ${result.statusChanges} updated, ${result.newContacts} new, ${result.skipped} skipped`,
      metadata: { ...(result as unknown as Record<string, unknown>), syncResult },
    }
  }

  private async computeThreshold(): Promise<Date | null> {
    const lastSuccess = await this.jobsService.getLastSuccessTimestamp(JobType.RUN_ELIGIBILITY)
    if (!lastSuccess) return null
    const lookbackDays = this.configService.get<number>('sync.eligibilityLookbackDays')!
    return new Date(lastSuccess.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
  }
}
