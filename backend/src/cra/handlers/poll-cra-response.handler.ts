import { Injectable } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import path from 'path'
import fs from 'fs'
import { writeFile } from 'fs/promises'
import { firstValueFrom } from 'rxjs'
import { BatchesService } from 'src/api/batches/batches.service'
import { ContactsService } from 'src/api/contacts/contacts.service'
import { PrismaService } from 'src/common/database/prisma.service'
import {
  BATCH_DETAIL_EVENT,
  BATCH_DETAIL_STATUS,
  BATCH_EVENT,
  CSA_EVENT,
} from 'src/common/state-machine/constants'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { InboundResponseService } from '../inbound/inbound-response.service'
import {
  createDirIfNotExist,
  getBatchSystemCommentByCode,
  getErrorMessageByRejectCode,
  returnAllRejectCode,
} from '../inbound/inbound.helper'
import type { CraResDetail } from '../inbound/inbound.interface'

const { DESTINATION_ID, TRAN_STAT_CODE, FILE_STAT_CODE, FILE_DIRECTION, UPDATED_BY } =
  CRA_DATA_HANDLING_CONSTANT

/*
 * Checks for response files from CRA and processes them
 * Triggered by CronJob POLL_CRA_RESPONSE
 */
@Injectable()
export class PollCraResponseHandler extends BaseJob {
  readonly jobType = JobType.POLL_CRA_RESPONSE

  private readonly fileStoragePath: string
  private readonly fileTransferServiceUrl: string

  // Per-run state shared across private methods
  private processedBatchIds!: Set<number>
  private recordsAccepted!: number
  private recordsRejected!: number
  private recordsRecycled!: number

  constructor(
    private readonly inboundResponseService: InboundResponseService,
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly batchesService: BatchesService,
    private readonly contactsService: ContactsService,
  ) {
    super()
    this.fileStoragePath = this.configService.get<string>('app.fileStoragePath')
    this.fileTransferServiceUrl = this.configService.get<string>('app.fileTransferServiceUrl')
  }

  async execute(_context: JobContext): Promise<JobResult> {
    // Reset per-run state (handler instance is reused across retries)
    this.processedBatchIds = new Set<number>()
    this.recordsAccepted = 0
    this.recordsRejected = 0
    this.recordsRecycled = 0

    // 1. List remote files and find new ones
    const existingFiles = await this.prisma.transferFile.findMany({
      where: { direction: FILE_DIRECTION.INBOUND },
    })

    const listResponse = await firstValueFrom(
      this.httpService.get(
        `${this.fileTransferServiceUrl}/api/destinations/${DESTINATION_ID}/remote-files`,
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const remoteFiles = listResponse?.data?.files ?? []
    this.logger.log(`Polled CRA: ${existingFiles.length} in DB, ${remoteFiles.length} remote`)

    // 2. Find first downloadable file not already in DB
    const downloadableFile = remoteFiles.find(
      (remote: { fileName: string }) =>
        !existingFiles.some((db) => db.fileName === remote.fileName),
    )

    if (!downloadableFile) {
      return {
        success: true,
        message: 'No new CRA response files to process',
        metadata: { files_processed: 0, records_updated: 0 },
      }
    }

    // 3. Validate file name format: {userId}.{env}RSP{seq}.txt
    const fileMiddle = downloadableFile.fileName.split('.')[1] ?? ''
    const fileEnvFlag = fileMiddle.slice(0, 1)
    const fileTypeFlag = fileMiddle.slice(1, 4)
    const expectedEnv = process.env.NODE_ENV === 'production' ? 'P' : 'V'

    if (fileTypeFlag !== 'RSP' || fileEnvFlag !== expectedEnv) {
      this.logger.log(
        `Skipping ${downloadableFile.fileName}: not a valid response file for this environment`,
      )
      return {
        success: true,
        message: 'No valid CRA response files to process',
        metadata: { files_processed: 0, records_updated: 0 },
      }
    }

    // 4. Download file from file transfer service
    this.logger.log(`Downloading CRA response file: ${downloadableFile.fileName}`)
    const downloadResponse = await firstValueFrom(
      this.httpService.get(
        `${this.fileTransferServiceUrl}/api/destinations/${DESTINATION_ID}/local/inbound/files/${downloadableFile.fileName}`,
        { headers: { 'Content-Type': 'text/plain' }, responseType: 'arraybuffer' },
      ),
    )

    // 5. Save to local storage
    const inboundDir = path.join(this.fileStoragePath, DESTINATION_ID, 'inbound')
    createDirIfNotExist(inboundDir)
    const localFilePath = path.join(inboundDir, downloadableFile.fileName)

    await writeFile(
      localFilePath,
      Buffer.isBuffer(downloadResponse.data)
        ? downloadResponse.data
        : Buffer.from(downloadResponse.data),
    )
    this.logger.log(`Saved response file to ${localFilePath}`)

    // 6. Parse file
    const { header, details } = this.inboundResponseService.parseFile(localFilePath)
    this.logger.log(
      `Parsed: ${details.length} detail records, header recordCount=${header.recordCount}`,
    )

    // 7. Process each detail
    for (const detail of details) {
      await this.processDetail(detail)
    }

    // 8. Aggregate batch statuses
    for (const batchId of this.processedBatchIds) {
      await this.aggregateBatchStatus(batchId)
    }

    // 9. Create inbound TransferFile record
    await this.prisma.transferFile.create({
      data: {
        destinationId: DESTINATION_ID,
        direction: FILE_DIRECTION.INBOUND,
        fileName: downloadableFile.fileName,
        fileSize: String(fs.statSync(localFilePath).size),
        deliveredAt: new Date(),
        downloadedAt: new Date(),
        referenceNumbers: details.map((d) => parseInt(d.referenceNum)),
      },
    })

    const totalUpdated = this.recordsAccepted + this.recordsRejected
    return {
      success: true,
      message: `Processed ${details.length} CRA response records`,
      metadata: {
        files_processed: 1,
        records_updated: totalUpdated,
        records_accepted: this.recordsAccepted,
        records_rejected: this.recordsRejected,
        records_recycled: this.recordsRecycled,
      },
    }
  }

  private buildSystemComment(
    newMessage: string | null,
    existingComments: string | null,
  ): string | null {
    if (!newMessage) return existingComments
    const date = new Date().toISOString().split('T')[0]
    const dated = `[${date}] ${newMessage}`
    return existingComments ? `${dated}\n${existingComments}` : dated
  }

  private async processDetail(detail: CraResDetail): Promise<void> {
    const detailId = parseInt(detail.referenceNum)

    const batchDetail = await this.prisma.contactBatchDetail.findUnique({
      where: { id: detailId },
      select: {
        id: true,
        contactId: true,
        batchId: true,
        transactionType: true,
        systemComments: true,
      },
    })

    if (!batchDetail) {
      this.logger.warn(`Batch detail not found for referenceNum ${detail.referenceNum}`)
      return
    }

    this.processedBatchIds.add(batchDetail.batchId)

    // File-level validation: if FILE_STAT_CD != FILE_OK, reject the detail
    if (detail.fileStatCd !== FILE_STAT_CODE.FILE_OK) {
      const fileError = getBatchSystemCommentByCode(detail.fileStatCd)
      const systemComments = this.buildSystemComment(fileError, batchDetail.systemComments)
      await this.batchesService.updateBatchDetailStatus(detailId, BATCH_DETAIL_EVENT.CRA_REJECTED, {
        additionalData: { systemComments },
      })
      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_REJECTED,
        UPDATED_BY.SYSTEM,
      )
      this.recordsRejected++
      return
    }

    const rejectCodes = returnAllRejectCode(detail)
    const errorMessage = getErrorMessageByRejectCode(rejectCodes)
    const systemComments = this.buildSystemComment(errorMessage || null, batchDetail.systemComments)

    if (
      detail.tranStatCd === TRAN_STAT_CODE.TRAN_ACCEPTED ||
      detail.tranStatCd === TRAN_STAT_CODE.PROBLEM_DEDUCTED
    ) {
      // Accepted or Problem Deducted
      await this.batchesService.updateBatchDetailStatus(detailId, BATCH_DETAIL_EVENT.CRA_ACCEPTED, {
        additionalData: { systemComments },
      })

      const additionalData: Record<string, unknown> = {}
      if (detail.ccraDinNum?.trim()) {
        const contact = await this.prisma.contact.findUnique({
          where: { id: batchDetail.contactId },
          select: { din: true },
        })
        if (!contact?.din) {
          additionalData.din = detail.ccraDinNum.trim()
        }
      }

      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_ACCEPTED,
        UPDATED_BY.SYSTEM,
        { additionalData },
      )
      this.recordsAccepted++
    } else if (detail.tranStatCd === TRAN_STAT_CODE.TRAN_REJECTED) {
      const isRecycled = rejectCodes.includes('998')

      if (isRecycled) {
        // Recycled — no state change, just update system comments
        this.logger.log(`Detail ${detailId} recycled (code 998), no status change`)
        await this.prisma.contactBatchDetail.update({
          where: { id: detailId },
          data: { systemComments, lastUpdatedBy: UPDATED_BY.SYSTEM },
        })
        this.recordsRecycled++
      } else {
        // Rejected
        await this.batchesService.updateBatchDetailStatus(
          detailId,
          BATCH_DETAIL_EVENT.CRA_REJECTED,
          {
            additionalData: { systemComments },
          },
        )
        await this.contactsService.updateCsaStatus(
          batchDetail.contactId,
          CSA_EVENT.CRA_REJECTED,
          UPDATED_BY.SYSTEM,
        )
        this.recordsRejected++
      }
    } else if (detail.tranStatCd === TRAN_STAT_CODE.TRAN_RECYCLED) {
      // Recycled — no state change
      this.logger.log(`Detail ${detailId} recycled (tranStatCd=3), no status change`)
      await this.prisma.contactBatchDetail.update({
        where: { id: detailId },
        data: { systemComments, lastUpdatedBy: UPDATED_BY.SYSTEM },
      })
      this.recordsRecycled++
    } else {
      // TODO: Verify with spec whether NOT_SET (0) should be treated as rejected or handled differently
      // Unhandled tranStatCd — treat as rejected
      this.logger.warn(
        `Detail ${detailId} has unexpected tranStatCd=${detail.tranStatCd}, treating as rejected`,
      )
      await this.batchesService.updateBatchDetailStatus(detailId, BATCH_DETAIL_EVENT.CRA_REJECTED, {
        additionalData: { systemComments },
      })
      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_REJECTED,
        UPDATED_BY.SYSTEM,
      )
      this.recordsRejected++
    }
  }

  private async aggregateBatchStatus(batchId: number): Promise<void> {
    const allDetails = await this.prisma.contactBatchDetail.findMany({
      where: { batchId },
      select: { status: true },
    })

    const statuses = allDetails.map((d) => d.status)
    const hasProcessed = statuses.includes(BATCH_DETAIL_STATUS.PROCESSED)
    const hasError = statuses.includes(BATCH_DETAIL_STATUS.ERROR)
    const hasInProgress = statuses.includes(BATCH_DETAIL_STATUS.IN_PROGRESS)

    if (hasInProgress) {
      this.logger.log(`Batch ${batchId}: some details still in_progress, batch stays in_progress`)
      return
    }

    let batchEvent: string
    let batchMessage: string | null = null
    if (hasProcessed && hasError) {
      batchEvent = BATCH_EVENT.CRA_PARTIAL_REJECTED
      batchMessage = 'At least one of the child record(s) in the Batch Details is in Error.'
    } else if (hasProcessed && !hasError) {
      batchEvent = BATCH_EVENT.CRA_ACCEPTED
    } else {
      batchEvent = BATCH_EVENT.CRA_ALL_REJECTED
      batchMessage = 'All child(ren) in the Batch Details are in Error.'
    }

    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: { systemComments: true },
    })

    const systemComments = this.buildSystemComment(batchMessage, batch?.systemComments ?? null)

    await this.batchesService.updateBatchStatus(batchId, batchEvent, {
      additionalData: systemComments != null ? { systemComments } : {},
    })
  }
}
