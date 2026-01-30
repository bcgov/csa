import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { FILE_MOCK_DATA } from '../outbound-file/file-mock-data'
import { FileCreateService } from '../outbound-file/file-create.service'
import { FileTransferClientService } from '../outbound-file/file-transfer.service'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'

const { header, details, trailer } = FILE_MOCK_DATA
const { FILE_TRANSFER_STATUS, DESTINATION_ID } = CRA_DATA_HANDLING_CONSTANT

/*
 * Triggered by CronJob SEND_CRA_FILE
 * Creates a CRA-formatted file with eligible contacts and send it for tranfer
 */
@Injectable()
export class SendCraFileHandler extends BaseJob {
  readonly jobType = JobType.SEND_CRA_FILE
  constructor(
    private readonly fileCreateService: FileCreateService,
    private readonly fileTransferClientService: FileTransferClientService,
  ) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    // TODO: Implement CRA file generation and transfer
    // 1. Query eligible contacts
    // 2. Format data according to CRA specifications
    // 3. Write to file storage
    // 4. Transfer file to CRA destination
    // 5. Return metadata: { file_path, record_count, transfer_status }
    const { filePath, fileName, recordCount } = this.fileCreateService.createFile(
      header,
      details,
      trailer,
    )
    const fileTransferResponse = await this.fileTransferClientService.sendFileToTransferService(
      filePath,
      fileName,
      DESTINATION_ID,
    )
    if (fileTransferResponse.statusCode === 226) {
      // console.log('File transfer successful')
      // update DB recort csa status and batch status
    } else {
      // console.error('File transfer failed', fileTransferResponse)
      // Retry or update DB record csa status and batch status
    }

    this.logger.log('CRA FILE TRANSFER RESPONSE', fileTransferResponse)

    return {
      success: true,
      message: 'CRA file send stub',
      metadata: {
        file_path: filePath,
        record_count: recordCount,
        transfer_status: FILE_TRANSFER_STATUS.COMPLETED,
      },
    }
  }
}
