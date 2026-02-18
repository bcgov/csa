import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { IcmSyncBackService } from '../icm/icm-sync-back.service'

@Injectable()
export class SyncIcmHandler extends BaseJob {
  readonly jobType = JobType.SYNC_ICM

  constructor(private readonly icmSyncBackService: IcmSyncBackService) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    const result = await this.icmSyncBackService.syncFlaggedContacts()

    if (result.failed > 0 && result.synced === 0) {
      return {
        success: false,
        message: `ICM sync failed: all ${result.failed} contacts failed`,
        metadata: { ...result },
      }
    }

    return {
      success: true,
      message: `ICM sync complete: ${result.synced} synced, ${result.failed} failed`,
      metadata: { ...result },
    }
  }
}
