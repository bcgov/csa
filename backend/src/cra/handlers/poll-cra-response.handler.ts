import { Injectable } from '@nestjs/common'
import { existsSync, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import path from 'path'
import { BatchesService } from 'src/api/batches/batches.service'
import { ContactsService } from 'src/api/contacts/contacts.service'
import { PrismaService } from 'src/common/database/prisma.service'
import { BATCH_DETAIL_EVENT, CSA_EVENT, CSA_STATUS } from 'src/common/state-machine/constants'

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
import type { DetailRecord04, HeaderRecord } from '../inbound/inbound-weekly.interface'
import { WeeklyContactMatcherService } from '../inbound/weekly-contact-matcher.service'
import { CraTransferService } from '../transfer/cra-transfer.service'
import { parseEffectiveDate } from 'src/common/utils'
const { DESTINATION_ID, FILE_DIRECTION, UPDATED_BY, WEEKLY_FILE } = CRA_DATA_HANDLING_CONSTANT
const { STATUS: WKL_STATUS, RECEIVE_MODE, TRANSACTION_TYPE_MAP, TRANSACTION_TYPES } = WEEKLY_FILE

@Injectable()
export class PollCraResponseHandler extends BaseJob {
  readonly jobType = JobType.POLL_CRA_RESPONSE

  private processedBatchIds!: Set<number>
  private recordsAccepted!: number
  private recordsRejected!: number
  private recordsRecycled!: number
  private recordsWklApproved!: number
  private recordsWklRefused!: number
  private recordsWklSkipped!: number
  private recordsWklUnmatchedApproved!: number
  private recordsWklUnmatchedRefused!: number
  private recordsWklUnmatchedSkipped!: number
  private newCraRecordsInWkl: DetailRecord04[] = []
  private unmatchedWklBatchId: number | null = null

  constructor(
    private readonly craTransferService: CraTransferService,
    private readonly inboundFileService: InboundFileService,
    private readonly inboundResponseService: InboundResponseService,
    private readonly craWeeklyResponseService: InboundWeeklyResponseService,
    private readonly prisma: PrismaService,
    private readonly batchesService: BatchesService,
    private readonly contactsService: ContactsService,
    private readonly icmSyncBackService: IcmSyncBackService,
    private readonly weeklyContactMatcher: WeeklyContactMatcherService,
  ) {
    super()
  }

  async execute(_context: JobContext): Promise<JobResult> {
    this.processedBatchIds = new Set<number>()
    this.recordsAccepted = 0
    this.recordsRejected = 0
    this.recordsRecycled = 0
    this.recordsWklApproved = 0
    this.recordsWklRefused = 0
    this.recordsWklSkipped = 0
    this.recordsWklUnmatchedApproved = 0
    this.recordsWklUnmatchedRefused = 0
    this.recordsWklUnmatchedSkipped = 0
    this.unmatchedWklBatchId = null

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

    const totalUpdated =
      this.recordsAccepted +
      this.recordsRejected +
      this.recordsWklApproved +
      this.recordsWklRefused +
      this.recordsWklUnmatchedApproved +
      this.recordsWklUnmatchedRefused
    return {
      success: true,
      message: `Processed ${totalRecordsProcessed} CRA response records from ${unprocessedResponseFiles.length} file(s)`,
      metadata: {
        files_processed: unprocessedResponseFiles.length,
        records_updated: totalUpdated,
        records_accepted: this.recordsAccepted,
        records_rejected: this.recordsRejected,
        records_recycled: this.recordsRecycled,
        records_wkl_approved: this.recordsWklApproved,
        records_wkl_refused: this.recordsWklRefused,
        records_wkl_skipped: this.recordsWklSkipped,
        records_wkl_unmatched_approved: this.recordsWklUnmatchedApproved,
        records_wkl_unmatched_refused: this.recordsWklUnmatchedRefused,
        records_wkl_unmatched_skipped: this.recordsWklUnmatchedSkipped,
        syncResult,
        craNewRecordsInWkl: {
          count: this.newCraRecordsInWkl.length,
          records: this.newCraRecordsInWkl,
        },
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
      this.unmatchedWklBatchId = null
      await this.weeklyContactMatcher.loadCandidates()
      for (const detail of details as DetailRecord04[]) {
        await this.processWeeklyDetail(detail, header as HeaderRecord)
      }
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

  private async processWeeklyDetail(detail: DetailRecord04, header: HeaderRecord): Promise<void> {
    if (detail.receiveMode !== RECEIVE_MODE.ELECTQRONIC) {
      this.recordsWklSkipped++
      return
    }

    if (detail.status?.toLocaleLowerCase() === WKL_STATUS.IN_PROGRESS) {
      this.recordsWklSkipped++
      return
    }
    const wklType = TRANSACTION_TYPE_MAP[detail.transactionType]

    if (!wklType || !TRANSACTION_TYPES.includes(wklType)) {
      this.logger.warn(`WKL: unexpected transaction type ${detail.transactionType}, skipping`)
      this.recordsWklSkipped++
      return
    }

    const batchDetail = await this.weeklyContactMatcher.findMatchingBatchDetail(detail)
    if (!batchDetail) {
      this.logger.warn(
        `WKL: no matching batch detail for ${detail.childGivenName.trim()} ${detail.childSurName.trim()} ` +
          `(DIN: ${detail.childDin?.trim() || 'none'})`,
      )
      const contacts = await this.weeklyContactMatcher.findMatchingContact(detail)
      if (!contacts) {
        this.logger.warn(
          `WKL: no matching contacts for ${detail.childGivenName.trim()} ${detail.childSurName.trim()} ` +
            `(DIN: ${detail.childDin?.trim() || 'none'})`,
        )
        this.newCraRecordsInWkl.push(detail)
        this.recordsWklSkipped++
        return
      }

      await this.processUnmatchedWeeklyDetail(
        detail,
        wklType,
        contacts.id,
        contacts.caseNumber,
        header as HeaderRecord,
      )
      return
    }

    this.processedBatchIds.add(batchDetail.batchId)

    if (batchDetail.transactionType !== wklType) {
      this.logger.warn(
        `WKL: transaction type mismatch for contact ${batchDetail.contactId} — ` +
          `WKL says ${wklType}, batch detail says ${batchDetail.transactionType}`,
      )
    }

    const isApproved =
      detail.status?.toLowerCase() === WKL_STATUS.COMPLETED ||
      detail.status?.toLowerCase() === WKL_STATUS.UPDATED
    const isRefused = detail.status?.toLowerCase() === WKL_STATUS.ABANDONED

    const din = detail.childDin?.trim()
    const effectiveDate = parseEffectiveDate(new Date())
    const additionalData = { effectiveDate, ...(din ? { din } : {}) }

    if (isApproved) {
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_WKL_APPROVED,
      )
      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_WKL_APPROVED,
        UPDATED_BY.SYSTEM,
        { additionalData },
      )
      this.recordsWklApproved++
    } else if (isRefused) {
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_WKL_REFUSED,
      )
      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_WKL_REFUSED,
        UPDATED_BY.SYSTEM,
        { additionalData },
      )
      this.recordsWklRefused++
    } else {
      this.logger.warn(
        `WKL: unexpected status '${detail.status}' for contact ${batchDetail.contactId}, skipping`,
      )
      this.recordsWklSkipped++
      return
    }
  }

  private async processUnmatchedWeeklyDetail(
    detail: DetailRecord04,
    wklType: string,
    contactId: number,
    caseNumber: string,
    header: HeaderRecord,
  ): Promise<void> {
    if (!this.unmatchedWklBatchId) {
      const batch = await this.batchesService.createWklBatchForUnmatchedRecords(header)
      this.unmatchedWklBatchId = batch.id
      this.processedBatchIds.add(batch.id)
    }

    const batchDetail = await this.batchesService.createBatchDetailsForWklUnmatchedRecords(
      this.unmatchedWklBatchId,
      contactId,
      wklType,
      detail.status,
      caseNumber,
      this.weeklyContactMatcher.buildWklMatchingSnapshot(detail),
    )

    if (batchDetail.transactionType !== wklType) {
      this.logger.warn(
        `WKL: transaction type mismatch for contact ${batchDetail.contactId} — ` +
          `WKL says ${wklType}, batch detail says ${batchDetail.transactionType}`,
      )
    }

    const isApproved =
      detail.status?.toLowerCase() === WKL_STATUS.COMPLETED ||
      detail.status?.toLowerCase() === WKL_STATUS.UPDATED
    const isRefused = detail.status?.toLowerCase() === WKL_STATUS.ABANDONED
    const din = detail.childDin?.trim()
    const additionalData = din ? { din } : undefined

    if (isApproved) {
      const nextState =
        wklType === 'application' ? CSA_STATUS.IN_PAY : CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_WKL_APPROVED,
      )
      await this.contactsService.forceUpdateCsaStatus(
        batchDetail.contactId,
        nextState,
        additionalData,
      )
      this.recordsWklUnmatchedApproved++
    } else if (isRefused) {
      const nextState =
        wklType === 'application'
          ? CSA_STATUS.APPLICATION_REFUSED_CRA
          : CSA_STATUS.CANCELLATION_REFUSED_CRA
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_WKL_REFUSED,
      )
      await this.contactsService.forceUpdateCsaStatus(
        batchDetail.contactId,
        nextState,
        additionalData,
      )
      this.recordsWklUnmatchedRefused++
    } else {
      this.logger.warn(
        `WKL: unexpected status '${detail.status}' for contact ${batchDetail.contactId}, skipping`,
      )
      this.recordsWklUnmatchedSkipped++
      return
    }
  }
}
