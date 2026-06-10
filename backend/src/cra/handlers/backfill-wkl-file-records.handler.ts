import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { WklFileRecordBackfillService } from '../inbound/wkl-file-record-backfill.service'

/** One-time backfill of wkl_file_records for WKL files processed before report persistence. */
@Injectable()
export class BackfillWklFileRecordsHandler extends BaseJob {
  readonly jobType = JobType.BACKFILL_WKL_FILE_RECORDS

  constructor(private readonly wklFileRecordBackfillService: WklFileRecordBackfillService) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    this.logger.log('Starting WKL file records backfill')

    const result = await this.wklFileRecordBackfillService.backfillAll()

    return {
      success: true,
      message:
        `WKL file records backfill complete: ${result.filesProcessed} file(s) processed, ` +
        `${result.filesSkipped} skipped, ${result.recordsUpserted} record(s) upserted`,
      metadata: result,
    }
  }
}
