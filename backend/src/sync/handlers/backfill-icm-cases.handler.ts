import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { ICM_INGESTION_CONFIGS } from '../icm/icm.config'
import { IcmService } from '../icm/icm.service'

/** One-time full load of ICM cases into stg_icm_cases (no incremental cursor). */
@Injectable()
export class BackfillIcmCasesHandler extends BaseJob {
  readonly jobType = JobType.BACKFILL_ICM_CASES

  constructor(private readonly icmService: IcmService) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    const config = ICM_INGESTION_CONFIGS.find((entry) => entry.name === 'cases')
    if (!config) {
      return {
        success: false,
        message: 'cases ingest config not found',
      }
    }

    this.logger.log('Full load of ICM cases (no incremental cursor)')

    const result = await this.icmService.ingestResource(config, undefined)

    return {
      success: true,
      message: `ICM cases backfill complete: ${result.fetched} fetched, ${result.upserted} upserted`,
      metadata: {
        lastUpdated: null,
        result,
      },
    }
  }
}
