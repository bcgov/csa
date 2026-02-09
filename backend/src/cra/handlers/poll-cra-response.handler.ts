import { Injectable } from '@nestjs/common'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { ResponseFileService } from '../inbound-file/response-file.service'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import path from 'path'
import { PrismaService } from 'src/common/database/prisma.service'
import { CRA_DATA_HANDLING_CONSTANT } from '../common/constants/cra.constant'
import { firstValueFrom } from 'rxjs'
import { returnDownloadableFile, createDirIfNotExist, createCurrentDate } from '../common/helpers/inbound.helper'
import { writeFile } from 'fs/promises'
import fs from 'fs'

const { DESTINATION_ID, LOCAL_DIR, FILE_DIRECTION } = CRA_DATA_HANDLING_CONSTANT

/*
 * Checks for response files from CRA and processes them
 * Triggered by CronJob POLL_CRA_RESPONSE
 */
@Injectable()
export class PollCraResponseHandler extends BaseJob {
  readonly jobType = JobType.POLL_CRA_RESPONSE
  private readonly fileStoragePath: string
  private readonly fileTransferServiceUrl: string


  constructor(
    private readonly responseFileService: ResponseFileService,
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,

  ) {
    super()
    this.fileStoragePath = this.configService.get<string>('app.fileStoragePath')!,
      this.fileTransferServiceUrl = this.configService.get<string>('app.fileTransferServiceUrl')
  }

  async execute(_context: JobContext): Promise<JobResult> {
    // TODO: Implement CRA response polling
    // 1. Poll CRA endpoint for response files
    // 2. Download new response files
    // 3. Parse and validate response data
    // 4. Update contact records with CRA responses
    // 5. Return metadata: { files_processed, records_updated, errors }

    const allFilesFromDB = await this.prisma.transferFile.findMany()

    const listRemoteFilesResponse = await firstValueFrom(
      this.httpService.get(`${this.fileTransferServiceUrl}/api/destinations/${DESTINATION_ID}/remote-files`, {
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    const allRemoteFiles = listRemoteFilesResponse?.data?.files

    // const downloadableFile = returnDownloadableFile(allFilesFromDB, allRemoteFiles)
    const downloadableFile = { fileName: 'response-file.txt' }

    const downloadResponse = await firstValueFrom(
      this.httpService.get(`${this.fileTransferServiceUrl}/api/destinations/${DESTINATION_ID}/local/inbound/files/${downloadableFile?.fileName}`, {
        headers: { 'Content-Type': 'text/plain' },
        responseType: 'arraybuffer',
      }),
    )
    const fileDownlodedAt = createCurrentDate()

    console.log('downloadResponse====>', downloadResponse?.data)
    const inboundDir = path.join(this.fileStoragePath, DESTINATION_ID, LOCAL_DIR.INBOUND)
    console.log('inboundDir====>', inboundDir)
    // const inboundDir = path.join('./storage', DESTINATION_ID, LOCAL_DIR.INBOUND)
    // Ensure inbound directory exists
    createDirIfNotExist(inboundDir)
    const localFilePath = `${inboundDir}/${downloadableFile?.fileName}`
    // Save write into file in local storage
    await writeFile(
      localFilePath,
      Buffer.isBuffer(downloadResponse.data)
        ? downloadResponse.data
        : Buffer.from(downloadResponse.data),
    )

    console.log('Exists:', fs.existsSync(localFilePath))
    console.log('Size:', fs.statSync(localFilePath).size)

    console.log('downloadResponse data saved to local file system at', localFilePath)

    console.log('allFilesFromDB====>', allFilesFromDB)
    console.log('allRemoteFiles====>', allRemoteFiles)
    console.log('downloadableFile====>', downloadableFile)

    const { header, details, trailer } = this.responseFileService.parseFile(localFilePath)
    console.log('Response file data', header, details, trailer)

    // create response file records in transfer_files table
    const referenceNumbers = [1, 2, 3]
    const batchId = 2 // batchId can be extracted from referenceNum

    const fileTransferObj = {
      batchId: batchId,
      destinationId: DESTINATION_ID,
      direction: FILE_DIRECTION.INBOUND,
      fileName: downloadableFile?.fileName || 'unknown',
      fileSize: String(fs.statSync(localFilePath).size),
      deliveredAt: createCurrentDate(),
      downloadedAt: fileDownlodedAt,
      referenceNumbers
    }


    const batchUpdateRes = await this.prisma.batch.update({
      where: { id: batchId },
      data: {
        status: 'CRA PROCESSED'
      }
    })

    const createdfileTransferRecord = await this.prisma.transferFile.create({
      data: fileTransferObj
    })


    console.log('Created file transfer record in DB', createdfileTransferRecord)

    this.logger.log('POLL_CRA_RESPONSE stub - not yet implemented', createdfileTransferRecord)

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
