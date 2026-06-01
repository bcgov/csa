import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { ICM_INGESTION_CONFIGS } from '../icm/icm.config'
import { IcmService } from '../icm/icm.service'

/** One-time full load of OOC agreement lines into stg_icm_agreement_line (no incremental cursor). */
@Injectable()
export class BackfillOocAgreementLinesHandler extends BaseJob {
  readonly jobType = JobType.BACKFILL_OOC_AGREEMENT_LINES

  constructor(private readonly icmService: IcmService) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    const config = ICM_INGESTION_CONFIGS.find((entry) => entry.name === 'ooc_agreement_lines')
    if (!config) {
      return {
        success: false,
        message: 'ooc_agreement_lines ingest config not found',
      }
    }

    this.logger.log('Full load of OOC agreement lines (no incremental cursor)')

    const result = await this.icmService.ingestResource(config, undefined)

    return {
      success: true,
      message: `OOC agreement lines backfill complete: ${result.fetched} fetched, ${result.upserted} upserted`,
      metadata: {
        lastUpdated: null,
        result,
      },
    }
  }
}
