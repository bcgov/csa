import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'

/*
 * Triggered by CronJob SEND_CRA_FILE
 * Creates a CRA-formatted file with eligible contacts and send it for tranfer
 */
@Injectable()
export class SendCraFileHandler extends BaseJob {
  readonly jobType = JobType.SEND_CRA_FILE

  async execute(_context: JobContext): Promise<JobResult> {
    // TODO: Implement CRA file generation and transfer
    // 1. Query eligible contacts
    // 2. Format data according to CRA specifications
    // 3. Write to file storage
    // 4. Transfer file to CRA destination
    // 5. Return metadata: { file_path, record_count, transfer_status }

    this.logger.log('SEND_CRA_FILE stub - not yet implemented')

    return {
      success: true,
      message: 'CRA file send stub',
      metadata: {
        file_path: null,
        record_count: 0,
        transfer_status: 'pending',
      },
    }
  }
}
