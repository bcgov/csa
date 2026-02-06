import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { ResponseFileService } from '../inbound-file/response-file.service'
import path from 'path'
// import { PrismaService } from 'src/common/database/prisma.service'

/*
 * Checks for response files from CRA and processes them
 * Triggered by CronJob POLL_CRA_RESPONSE
 */
@Injectable()
export class PollCraResponseHandler extends BaseJob {
  readonly jobType = JobType.POLL_CRA_RESPONSE
  constructor(private readonly responseFileService: ResponseFileService) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    // TODO: Implement CRA response polling
    // 1. Poll CRA endpoint for response files
    // 2. Download new response files
    // 3. Parse and validate response data
    // 4. Update contact records with CRA responses
    // 5. Return metadata: { files_processed, records_updated, errors }

    const localPath = './src/cra/inbound-file/response-file.txt'

    const fullPath = path.join(process.cwd(), localPath)

    console.log('fullPath====>', fullPath)

    const { header, details, trailer } = this.responseFileService.parseFile(fullPath)
    console.log('Response file data', header, details, trailer)

    this.logger.log('POLL_CRA_RESPONSE stub - not yet implemented')

    return {
      success: true,
      message: 'CRA response polling stub',
      metadata: {
        files_processed: details.length + 2,
        records_updated: 0,
        errors: [],
      },
    }
  }
}
