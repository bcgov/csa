import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobsService } from 'src/jobs/jobs.service'
import { ICM_INGESTION_CONFIGS } from '../icm/icm.config'
import { IcmService } from '../icm/icm.service'

// Fetches ICM Data using incremental sync
@Injectable()
export class IngestIcmHandler extends BaseJob {
  readonly jobType = JobType.INGEST_ICM

  constructor(
    private readonly jobsService: JobsService,
    private readonly icmService: IcmService,
    private readonly configService: ConfigService,
  ) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    // 1. Compute lastUpdated: lastSuccess - lookback days (null = full load)
    const lastUpdated = await this.computeLastUpdated()

    this.logger.log(
      lastUpdated
        ? `Incremental sync from ${lastUpdated.toISOString()}`
        : 'Full load (no previous successful run)',
    )

    // 2. Ingest all ICM APIs
    const results = await this.icmService.ingestAll(ICM_INGESTION_CONFIGS, lastUpdated)

    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0)
    const totalUpserted = results.reduce((sum, r) => sum + r.upserted, 0)

    return {
      success: true,
      message: `ICM ingestion complete: ${totalFetched} fetched, ${totalUpserted} upserted`,
      metadata: {
        lastUpdated: lastUpdated?.toISOString() ?? null,
        results,
        totalFetched,
        totalUpserted,
      },
    }
  }

  private async computeLastUpdated(): Promise<Date | null> {
    const lastSuccess = await this.jobsService.getLastSuccessTimestamp(JobType.INGEST_DATA)
    if (!lastSuccess) return null

    const lookbackDays = this.configService.get<number>('sync.icmCursorLookbackDays')!
    const cursor = new Date(lastSuccess.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
    return cursor
  }
}
