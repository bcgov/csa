import { Injectable, Logger } from '@nestjs/common'
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
import {
  // returnDownloadableFile,
  createDirIfNotExist,
  createCurrentDate,
  getBatchSystemCommentByCode,
  getErrorMessageByRejectCode,
  returnAllRejectCode,
} from '../common/helpers/inbound.helper'
import { writeFile } from 'fs/promises'
import fs from 'fs'
import { StateMachineService } from 'src/common/state-machine/state-machine.service'

const {
  DESTINATION_ID,
  LOCAL_DIR,
  FILE_DIRECTION,
  UPDATED_BY,
  CSA_EVENT_BY_TRAN_CD,
  BATCH_EVENT_BY_FILE_STAT_CODE,
  RESPONSE_FILE_TYPE,
} = CRA_DATA_HANDLING_CONSTANT

/*
 * Checks for response files from CRA and processes them
 * Triggered by CronJob POLL_CRA_RESPONSE
 */
@Injectable()
export class PollCraResponseHandler extends BaseJob {
  readonly jobType = JobType.POLL_CRA_RESPONSE
  private readonly fileStoragePath: string
  private readonly fileTransferServiceUrl: string
  logger = new Logger(PollCraResponseHandler.name)

  constructor(
    private readonly responseFileService: ResponseFileService,
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly stateMachine: StateMachineService,
  ) {
    super()
    this.fileStoragePath = this.configService.get<string>('app.fileStoragePath')
    this.fileTransferServiceUrl = this.configService.get<string>('app.fileTransferServiceUrl')
  }

  async execute(_context: JobContext): Promise<JobResult> {
    // TODO: Implement CRA response polling
    // 1. Poll CRA endpoint for response files
    // 2. Download new response files
    // 3. Parse and validate response data
    // 4. Update contact records with CRA responses
    // 5. Return metadata: { files_processed, records_updated, errors }

    const referenceNumbers = []
    const uniqueBatchIds = {}
    let recordUpdated = 0
    const allFilesFromDB = await this.prisma.transferFile.findMany()

    const listRemoteFilesResponse = await firstValueFrom(
      this.httpService.get(
        `${this.fileTransferServiceUrl}/api/destinations/${DESTINATION_ID}/remote-files`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    const allRemoteFiles = listRemoteFilesResponse?.data?.files

    this.logger.log(
      `Polled CRA response files. Files in DB: ${allFilesFromDB.length}, Files in remote: ${allRemoteFiles.length}`,
    )

    // const downloadableFile = returnDownloadableFile(allFilesFromDB, allRemoteFiles)
    const downloadableFile = { fileName: 'craUserId.VRSP0001.txt' }
    if (!downloadableFile) {
      this.logger.log('No new CRA response files to process')
      return {
        success: true,
        message: 'CRA response polling completed - no new files to process',
        metadata: { files_processed: 0, records_updated: recordUpdated, errors: [] },
      }
    }

    const responseFileFlag = downloadableFile.fileName.split('.')[1].slice(1, 4)
    const fileEnvFlag = downloadableFile.fileName.split('.')[1].slice(0, 1)
    const responseFileEnv = process.env.NODE_ENV === 'production' ? 'P' : 'V'
    if (responseFileFlag === RESPONSE_FILE_TYPE.RSP && fileEnvFlag === responseFileEnv) {
      this.logger.log(`Found new CRA response file to process: ${downloadableFile.fileName}`)
      const downloadResponse = await firstValueFrom(
        this.httpService.get(
          `${this.fileTransferServiceUrl}/api/destinations/${DESTINATION_ID}/local/inbound/files/${downloadableFile?.fileName}`,
          {
            headers: { 'Content-Type': 'text/plain' },
            responseType: 'arraybuffer',
          },
        ),
      )
      const fileDownlodedAt = createCurrentDate()
      const inboundDir = path.join(this.fileStoragePath, DESTINATION_ID, LOCAL_DIR.INBOUND)
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
      this.logger.log(`Downloaded CRA response file saved to local file system at ${localFilePath}`)

      const { header, details, trailer } = this.responseFileService.parseFile(localFilePath)
      this.logger.log(
        `Parsed CRA response file. Header: ${JSON.stringify(header)}, Trailer: ${JSON.stringify(trailer)}, Number of details records: ${details.length}`,
      )
      console.log('Response file data', header, details, trailer)
      // update batch_details records

      for (const detail of details) {
        referenceNumbers.push(parseInt(detail.referenceNum))
        const allRejectCode = returnAllRejectCode(detail)
        const batchDetailsSystemComments = getErrorMessageByRejectCode(allRejectCode)
        const getCurrentCsaStatus = await this.prisma.contactBatchDetail.findUnique({
          where: { id: parseInt(detail.referenceNum) },
          select: { status: true },
        })
        recordUpdated++
        const nextCsaStatus = this.stateMachine.getNextState(
          'csaStatus',
          getCurrentCsaStatus?.status,
          CSA_EVENT_BY_TRAN_CD[detail.tranStatCd],
        ) as string
        this.logger.log(
          `Processing detail record with referenceNum ${detail.referenceNum}. Current CSA status: ${getCurrentCsaStatus?.status}, CRA transaction status code: ${detail.tranStatCd}, Next CSA status: ${nextCsaStatus}, System comments: ${batchDetailsSystemComments}`,
        )
        const batchDetailsUpdateRes = await this.prisma.contactBatchDetail.update({
          where: { id: parseInt(detail.referenceNum) },
          data: {
            status: nextCsaStatus,
            systemComments: batchDetailsSystemComments,
            lastUpdatedBy: UPDATED_BY.SYSTEM,
          },
        })

        await this.prisma.contact.update({
          where: { id: batchDetailsUpdateRes.contactId },
          data: {
            csaStatus: nextCsaStatus,
            lastUpdatedBy: UPDATED_BY.SYSTEM,
          },
        })

        if (!uniqueBatchIds[batchDetailsUpdateRes?.batchId]) {
          uniqueBatchIds[batchDetailsUpdateRes?.batchId] = {}
          const currentBatchStatus = await this.prisma.batch.findUnique({
            where: { id: batchDetailsUpdateRes.batchId },
            select: { status: true },
          })

          const nextBatchStatus = this.stateMachine.getNextState(
            'batch',
            currentBatchStatus?.status,
            BATCH_EVENT_BY_FILE_STAT_CODE[detail.fileStatCd],
          ) as string

          const batchSystemComments = getBatchSystemCommentByCode(detail.fileStatCd)
          uniqueBatchIds[batchDetailsUpdateRes?.batchId]['nextBatchStatus'] = nextBatchStatus
          uniqueBatchIds[batchDetailsUpdateRes?.batchId]['batchSystemComments'] =
            batchSystemComments
        }
      }

      // update batch status and insert transfer file record

      for (const [batchId, batchData] of Object.entries(uniqueBatchIds)) {
        const fileTransferObj = {
          batchId: parseInt(batchId),
          destinationId: DESTINATION_ID,
          direction: FILE_DIRECTION.INBOUND,
          fileName: downloadableFile?.fileName || 'unknown',
          fileSize: String(fs.statSync(localFilePath).size),
          deliveredAt: createCurrentDate(),
          downloadedAt: fileDownlodedAt,
          referenceNumbers,
        }
        await Promise.all([
          this.prisma.batch.update({
            where: { id: parseInt(batchId) },
            data: {
              status: batchData['nextBatchStatus'],
              systemComments: batchData['batchSystemComments'],
            },
          }),
          this.prisma.transferFile.create({
            data: fileTransferObj,
          }),
        ])
      }

      return {
        success: true,
        message: 'CRA response polling stub',
        metadata: {
          files_processed: details.length + 2,
          records_updated: recordUpdated,
          errors: [],
        },
      }
    } else {
      this.logger.log(
        `No valid CRA response files to process. Found file: ${downloadableFile?.fileName}, but it does not match expected format or environment.`,
      )
      return {
        success: true,
        message: 'CRA response polling completed - no valid response files to process',
        metadata: {
          files_processed: 0,
          records_updated: recordUpdated,
          errors: [],
        },
      }
    }
  }
}
