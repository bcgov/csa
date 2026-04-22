import { Injectable } from '@nestjs/common'
import { existsSync, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import path from 'path'
import { BatchesService } from 'src/api/batches/batches.service'
import { ContactsService } from 'src/api/contacts/contacts.service'
import { PrismaService } from 'src/common/database/prisma.service'
import { BATCH_DETAIL_EVENT, CSA_EVENT } from 'src/common/state-machine/constants'

import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { IcmSyncBackService, SyncBackResult } from 'src/sync/icm/icm-sync-back.service'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { InboundFileService } from '../inbound/inbound-file.service'
import { InboundResponseService } from '../inbound/inbound-response.service'
import { InboundWeeklyResponseService } from '../inbound/inbound-weekly-response.service'
import { DETAIL_OUTCOME, type CraResDetail } from '../inbound/inbound.interface'
import { CraTransferService } from '../transfer/cra-transfer.service'

const { DESTINATION_ID, FILE_DIRECTION, UPDATED_BY } = CRA_DATA_HANDLING_CONSTANT

@Injectable()
export class PollCraResponseHandler extends BaseJob {
  readonly jobType = JobType.POLL_CRA_RESPONSE

  private processedBatchIds!: Set<number>
  private recordsAccepted!: number
  private recordsRejected!: number
  private recordsRecycled!: number

  constructor(
    private readonly craTransferService: CraTransferService,
    private readonly inboundFileService: InboundFileService,
    private readonly inboundResponseService: InboundResponseService,
    private readonly craWeeklyResponseService: InboundWeeklyResponseService,
    private readonly prisma: PrismaService,
    private readonly batchesService: BatchesService,
    private readonly contactsService: ContactsService,
    private readonly icmSyncBackService: IcmSyncBackService,
  ) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    this.processedBatchIds = new Set<number>()
    this.recordsAccepted = 0
    this.recordsRejected = 0
    this.recordsRecycled = 0

    await this.downloadAndRegisterNewFiles()

    const unprocessedResponseFiles = await this.prisma.transferFile.findMany({
      where: { direction: FILE_DIRECTION.INBOUND, isDetailsProcessed: false, isValid: true },
    })

    if (unprocessedResponseFiles.length === 0) {
      return {
        success: true,
        message: 'No new CRA response files to process',
        metadata: { files_processed: 0, records_updated: 0 },
      }
    }

    let totalRecordsProcessed = 0
    for (const responseFile of unprocessedResponseFiles) {
      totalRecordsProcessed += await this.processResponseFile(responseFile)
    }

    for (const batchId of this.processedBatchIds) {
      await this.batchesService.aggregateBatchStatus(batchId)
    }

    let syncResult: SyncBackResult | null = null
    try {
      syncResult = await this.icmSyncBackService.syncFlaggedWithRetry()
    } catch (err) {
      this.logger.warn(`ICM sync-back failed: ${(err as Error).message}`)
    }

    const totalUpdated = this.recordsAccepted + this.recordsRejected
    return {
      success: true,
      message: `Processed ${totalRecordsProcessed} CRA response records from ${unprocessedResponseFiles.length} file(s)`,
      metadata: {
        files_processed: unprocessedResponseFiles.length,
        records_updated: totalUpdated,
        records_accepted: this.recordsAccepted,
        records_rejected: this.recordsRejected,
        records_recycled: this.recordsRecycled,
        syncResult,
      },
    }
  }

  private async downloadAndRegisterNewFiles(): Promise<void> {
    const existingFiles = await this.prisma.transferFile.findMany({
      where: { direction: FILE_DIRECTION.INBOUND },
      select: { fileName: true },
    })
    const existingNames = new Set(existingFiles.map((file) => file.fileName))

    const remoteFiles = await this.craTransferService.listInboundFiles()
    const newFiles = remoteFiles.filter((file) => !existingNames.has(file.fileName))

    for (const file of newFiles) {
      const fileBuffer = await this.craTransferService.downloadInboundFile(file.fileName)
      const localFilePath = this.inboundFileService.getLocalFilePath(DESTINATION_ID, file.fileName)

      const dir = path.dirname(localFilePath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      await writeFile(localFilePath, fileBuffer)

      const valid = this.inboundFileService.isValidResponseFile(file.fileName)
      if (!valid) {
        this.logger.warn(`Invalid response file format: ${file.fileName}`)
      }

      await this.prisma.transferFile.create({
        data: {
          destinationId: DESTINATION_ID,
          direction: FILE_DIRECTION.INBOUND,
          fileName: file.fileName,
          fileSize: String(fileBuffer.length),
          downloadedAt: new Date(),
          isValid: valid,
          isDetailsProcessed: !valid,
        },
      })
    }
  }

  private async processResponseFile(responseFile: {
    id: number
    fileName: string
  }): Promise<number> {
    const localFilePath = this.inboundFileService.getLocalFilePath(
      DESTINATION_ID,
      responseFile.fileName,
    )

    const fileType = this.inboundFileService.getResponseFileType(responseFile.fileName)
    const isWeekly = fileType === 'WKL'

    let parsed:
      | ReturnType<InboundResponseService['parseFile']>
      | ReturnType<InboundWeeklyResponseService['parseWeeklyResponseFile']>
    try {
      if (isWeekly) {
        this.logger.log(
          `Parsing weekly response file ${responseFile.fileName} with InboundWeeklyResponseService`,
        )
        parsed = this.craWeeklyResponseService.parseWeeklyResponseFile(localFilePath)
      } else {
        parsed = this.inboundResponseService.parseFile(localFilePath)
      }
    } catch (error) {
      this.logger.error(`Failed to parse response file ${responseFile.fileName}: ${error}`)
      await this.prisma.transferFile.update({
        where: { id: responseFile.id },
        data: { isValid: false, isDetailsProcessed: true },
      })
      return 0
    }

    const { header, details, trailer } = parsed

    const recordCount =
      (header && 'recordCount' in header ? header.recordCount : undefined) ??
      (trailer && 'recordCount' in trailer ? trailer.recordCount : undefined)

    this.logger.log(
      `Parsed File: ${responseFile.fileName}, Valid Processed records= ${details.length} ` +
        (recordCount !== undefined ? `, Total Records in File = ${recordCount}` : ''),
    )

    if (isWeekly) {
      this.logger.warn(
        `Weekly response file ${responseFile.fileName} parsed with ${details.length} ` +
          `detail record(s); state-transition logic is not yet implemented — details are not being persisted`,
      )
    } else {
      for (const detail of details as CraResDetail[]) {
        await this.processResponseDetail(detail)
      }
    }

    await this.prisma.transferFile.update({
      where: { id: responseFile.id },
      data: {
        isDetailsProcessed: true,
        deliveredAt: new Date(),
        referenceNumbers: isWeekly
          ? []
          : (details as CraResDetail[]).map((detail) => detail.referenceNum),
      },
    })

    return details.length
  }

  private async processResponseDetail(detail: CraResDetail): Promise<void> {
    const batchDetail = await this.prisma.contactBatchDetail.findUnique({
      where: { referenceNumber: detail.referenceNum },
      select: {
        id: true,
        contactId: true,
        batchId: true,
        systemComments: true,
      },
    })

    if (!batchDetail) {
      this.logger.warn(`Batch detail not found for referenceNum ${detail.referenceNum}`)
      return
    }

    this.processedBatchIds.add(batchDetail.batchId)

    const { outcome, systemComments } = this.inboundResponseService.classifyDetail(
      detail,
      batchDetail.systemComments,
    )

    if (outcome === DETAIL_OUTCOME.ACCEPTED) {
      this.recordsAccepted++
    } else if (outcome === DETAIL_OUTCOME.FILE_ERROR) {
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_FILE_REJECTED,
        {
          additionalData: { systemComments },
        },
      )
      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_FILE_REJECTED,
        UPDATED_BY.SYSTEM,
      )
      this.recordsRejected++
    } else if (outcome === DETAIL_OUTCOME.REJECTED) {
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_RSP_REJECTED,
        {
          additionalData: { systemComments },
        },
      )
      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_RSP_REJECTED,
        UPDATED_BY.SYSTEM,
      )
      this.recordsRejected++
    } else {
      this.logger.log(`Detail ${batchDetail.id} recycled, no status change`)
      await this.prisma.contactBatchDetail.update({
        where: { id: batchDetail.id },
        data: { systemComments, lastUpdatedBy: UPDATED_BY.SYSTEM },
      })
      this.recordsRecycled++
    }
  }
}
