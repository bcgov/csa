import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobsService } from 'src/jobs/jobs.service'
import {
  IcmInboundCsaSyncService,
  IcmInboundCsaSyncResult,
} from '../icm/icm-inbound-csa-sync.service'
import { IcmSyncBackService, SyncBackResult } from '../icm/icm-sync-back.service'
import { EligibilityService } from '../eligibility/eligibility.service'

/*
 * Runs ICM→CSA CSA field reconciliation, eligibility rules, then CSA→ICM sync-back.
 * Triggered independently via entrypoint or API — not chained from INGEST_DATA.
 */
@Injectable()
export class RunEligibilityHandler extends BaseJob {
  readonly jobType = JobType.RUN_ELIGIBILITY

  constructor(
    private readonly eligibilityService: EligibilityService,
    private readonly icmInboundCsaSyncService: IcmInboundCsaSyncService,
    private readonly icmSyncBackService: IcmSyncBackService,
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
  ) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    const threshold = await this.computeThreshold()

    let inboundSyncResult: IcmInboundCsaSyncResult | null = null
    try {
      inboundSyncResult = await this.icmInboundCsaSyncService.syncFromStaging(threshold)
    } catch (err) {
      this.logger.warn(`ICM inbound CSA sync failed: ${(err as Error).message}`)
    }

    const result = await this.eligibilityService.run(threshold)

    let syncResult: SyncBackResult | null = null
    try {
      syncResult = await this.icmSyncBackService.syncFlaggedWithRetry()
    } catch (err) {
      this.logger.warn(`ICM sync-back failed: ${(err as Error).message}`)
    }

    return {
      success: true,
      message: `Eligibility complete: ${result.processed} processed, ${result.statusChanges} updated, ${result.newContacts} new, ${result.skipped} skipped`,
      metadata: {
        ...(result as unknown as Record<string, unknown>),
        inboundSyncResult,
        syncResult,
      },
    }
  }

  private async computeThreshold(): Promise<Date | null> {
    const lastSuccess = await this.jobsService.getLastSuccessTimestamp(JobType.RUN_ELIGIBILITY)
    if (!lastSuccess) return null
    const lookbackDays = this.configService.get<number>('sync.eligibilityLookbackDays')!
    return new Date(lastSuccess.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
  }
}
