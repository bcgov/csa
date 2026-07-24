import { Injectable } from '@nestjs/common'
import { existsSync, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import path from 'path'
import { BatchesService } from 'src/api/batches/batches.service'
import { ContactsService } from 'src/api/contacts/contacts.service'
import { PrismaService } from 'src/common/database/prisma.service'
import { BATCH_DETAIL_EVENT, CSA_EVENT } from 'src/common/state-machine/constants'

import { csaProcessingBatchDate, parseWklDate } from 'src/common/utils'
import { BaseJob } from 'src/jobs/base-job'
import { JobType } from 'src/jobs/enums/job-type.enum'
import { JobResult } from 'src/jobs/interfaces/job-result.interface'
import { JobContext } from 'src/jobs/interfaces/job.interface'
import { JobsService } from 'src/jobs/jobs.service'
import { IcmSyncBackService, SyncBackResult } from 'src/sync/icm/icm-sync-back.service'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { InboundFileService } from '../inbound/inbound-file.service'
import { InboundResponseService } from '../inbound/inbound-response.service'
import { InboundWeeklyResponseService } from '../inbound/inbound-weekly-response.service'
import type { DetailRecord04, HeaderRecord } from '../inbound/inbound-weekly.interface'
import { DETAIL_OUTCOME, type CraResDetail } from '../inbound/inbound.interface'
import { WeeklyContactMatcherService } from '../inbound/weekly-contact-matcher.service'
import { WklAssociatedRecordProcessorService } from '../inbound/wkl-associated-record-processor.service'
import { WklFileRecordService } from '../inbound/wkl-file-record.service'
import { buildWklUpdatePayloads } from '../inbound/wkl-snapshot-data'
import { CraTransferService } from '../transfer/cra-transfer.service'
const {
  DESTINATION_ID,
  FILE_DIRECTION,
  UPDATED_BY,
  WEEKLY_FILE,
  RESPONSE_FILE_TYPE,
  WKL_MATCH_STATUS,
  BATCH_INITIATED_BY,
} = CRA_DATA_HANDLING_CONSTANT
const { STATUS: WKL_STATUS, RECEIVE_MODE, TRANSACTION_TYPE_MAP, TRANSACTION_TYPES } = WEEKLY_FILE

interface WklRecordContext {
  transferFileId: number
  recordIndex: number
  weeklyFileDate: Date | null
  /** Pacific calendar date when this WKL file is being processed (CSA Processing Date). */
  csaProcessingDate: Date
}

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
    private readonly jobsService: JobsService,
    private readonly icmSyncBackService: IcmSyncBackService,
    private readonly weeklyContactMatcher: WeeklyContactMatcherService,
    private readonly wklFileRecordService: WklFileRecordService,
    private readonly wklAssociatedRecordProcessor: WklAssociatedRecordProcessorService,
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
    this.newCraRecordsInWkl = []

    await this.downloadAndRegisterNewFiles()

    const unprocessedResponseFiles = await this.prisma.transferFile.findMany({
      where: { direction: FILE_DIRECTION.INBOUND, isDetailsProcessed: false, isValid: true },
    })

    // Sort files to ensure RSP files are processed before WKL files
    const sortedFiles = this.sortFilesByType(unprocessedResponseFiles)

    if (sortedFiles.length === 0) {
      return {
        success: true,
        message: 'No new CRA response files to process',
        metadata: { files_processed: 0, records_updated: 0 },
      }
    }

    let totalRecordsProcessed = 0
    for (const responseFile of sortedFiles) {
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

    const fileNames = sortedFiles.map((f) => f.fileName).join(', ')
    return {
      success: true,
      message: `Processed ${totalRecordsProcessed} records from ${sortedFiles.length} file(s): ${fileNames}`,
      metadata: {
        files_processed: sortedFiles.length,
        file_names: sortedFiles.map((f) => f.fileName),
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
        batch_ids: [...this.processedBatchIds],
        syncResult,
        craNewRecordsInWkl: {
          count: this.newCraRecordsInWkl.length,
          records: this.newCraRecordsInWkl,
        },
      },
    }
  }

  /**
   * Sort files to ensure RSP (Response) files are processed before WKL (Weekly) files.
   * Within the same file type, files are sorted by sequence number for deterministic ordering.
   * This is required by business to avoid processing errors when both file types are present.
   *
   * File naming convention: `<prefix>.<envFlag><typeFlag><seq>`
   * Example: craUserId.ARSP0001
   */
  private sortFilesByType(
    files: Array<{ id: number; fileName: string }>,
  ): Array<{ id: number; fileName: string }> {
    return [...files].sort((a, b) => {
      const typeA = this.inboundFileService.getResponseFileType(a.fileName)
      const typeB = this.inboundFileService.getResponseFileType(b.fileName)

      // RSP files should be processed before WKL files
      if (typeA === RESPONSE_FILE_TYPE.RSP && typeB === RESPONSE_FILE_TYPE.WKL) return -1
      if (typeA === RESPONSE_FILE_TYPE.WKL && typeB === RESPONSE_FILE_TYPE.RSP) return 1

      if (typeA === typeB) {
        const seqA = this.inboundFileService.getResponseFileSequenceNumber(a.fileName) ?? a.id
        const seqB = this.inboundFileService.getResponseFileSequenceNumber(b.fileName) ?? b.id
        return seqA - seqB
      }

      return 0
    })
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
          fileType: this.inboundFileService.getResponseFileType(file.fileName),
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

    const processedAt = new Date()

    if (isWeekly) {
      this.unmatchedWklBatchId = null
      await this.weeklyContactMatcher.loadCandidates()
      const weeklyHeader = header as HeaderRecord
      const weeklyFileDate = parseWklDate(weeklyHeader.processDate) ?? null
      const csaProcessingDate = csaProcessingBatchDate(processedAt)
      const weeklyDetails = details as DetailRecord04[]
      for (let i = 0; i < weeklyDetails.length; i++) {
        await this.processWeeklyDetail(weeklyDetails[i], weeklyHeader, {
          transferFileId: responseFile.id,
          recordIndex: i,
          weeklyFileDate,
          csaProcessingDate,
        })
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
        deliveredAt: processedAt,
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
        { origin: 'PollCraResponseHandler.processResponseDetail' },
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
        { origin: 'PollCraResponseHandler.processResponseDetail' },
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

  private async processWeeklyDetail(
    detail: DetailRecord04,
    header: HeaderRecord,
    ctx: WklRecordContext,
  ): Promise<void> {
    if (detail.receiveMode !== RECEIVE_MODE.ELECTQRONIC) {
      await this.persistWklRecord(ctx, detail, { matchStatus: WKL_MATCH_STATUS.NA })
      this.recordsWklSkipped++
      return
    }

    if (detail.status?.toLocaleLowerCase() === WKL_STATUS.IN_PROGRESS) {
      await this.persistWklRecord(ctx, detail, { matchStatus: WKL_MATCH_STATUS.NA })
      this.recordsWklSkipped++
      return
    }
    const wklType = TRANSACTION_TYPE_MAP[detail.transactionType]

    if (!wklType || !TRANSACTION_TYPES.includes(wklType)) {
      this.logger.warn(`WKL: unexpected transaction type ${detail.transactionType}, skipping`)
      await this.persistWklRecord(ctx, detail, { matchStatus: WKL_MATCH_STATUS.SKIPPED })
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
        await this.persistWklRecord(ctx, detail, { matchStatus: WKL_MATCH_STATUS.UNMATCHED })
        this.recordsWklSkipped++
        return
      }

      const contactMatch = await this.processUnmatchedWeeklyDetail(
        detail,
        contacts.id,
        contacts.caseNumber,
        header,
        ctx.csaProcessingDate,
      )
      if (contactMatch) {
        await this.persistWklRecord(ctx, detail, {
          matchStatus: WKL_MATCH_STATUS.MATCHED,
          contactId: contactMatch.contactId,
          batchDetailId: contactMatch.batchDetailId,
          matchedBy: UPDATED_BY.SYSTEM,
          processedAt: new Date(),
        })
      } else {
        await this.persistWklRecord(ctx, detail, { matchStatus: WKL_MATCH_STATUS.SKIPPED })
      }
      return
    }

    this.processedBatchIds.add(batchDetail.batchId)

    if (batchDetail.transactionType !== wklType) {
      this.logger.warn(
        `WKL: transaction type mismatch for contact ${batchDetail.contactId} — ` +
          `WKL says ${wklType}, batch detail says ${batchDetail.transactionType}`,
      )
    }

    const status = detail.status?.trim().toLowerCase()

    const isApproved = status === WKL_STATUS.COMPLETED || status === WKL_STATUS.UPDATED

    const isRefused = status === WKL_STATUS.ABANDONED

    this.logger.log(
      `Processing WKL detail for contactId ${batchDetail.contactId}, transaction type ${wklType}, status ${detail.status}, ` +
        `isApproved: ${isApproved}, isRefused: ${isRefused}`,
    )

    const { contactData: additionalData, batchDetailData } = buildWklUpdatePayloads(detail, wklType)

    // Only CRA-initiated batch details receive the WKL cancellation snapshot.
    // Ministry-initiated batch details keep the snapshot captured at batch time.
    const batchDetailAdditionalData =
      batchDetail.initiatedBy === BATCH_INITIATED_BY.CRA ? batchDetailData : {}

    if (isApproved) {
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_WKL_APPROVED,
        { additionalData: batchDetailAdditionalData },
      )
      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_WKL_APPROVED,
        UPDATED_BY.SYSTEM,
        { additionalData, origin: 'PollCraResponseHandler.processWeeklyDetail' },
      )
      this.recordsWklApproved++
      await this.persistWklRecord(ctx, detail, {
        matchStatus: WKL_MATCH_STATUS.MATCHED,
        contactId: batchDetail.contactId,
        batchDetailId: batchDetail.id,
        matchedBy: UPDATED_BY.SYSTEM,
        processedAt: new Date(),
      })
    } else if (isRefused) {
      await this.batchesService.updateBatchDetailStatus(
        batchDetail.id,
        BATCH_DETAIL_EVENT.CRA_WKL_REFUSED,
        { additionalData: batchDetailAdditionalData },
      )
      await this.contactsService.updateCsaStatus(
        batchDetail.contactId,
        CSA_EVENT.CRA_WKL_REFUSED,
        UPDATED_BY.SYSTEM,
        { additionalData, origin: 'PollCraResponseHandler.processWeeklyDetail' },
      )
      this.recordsWklRefused++
      await this.persistWklRecord(ctx, detail, {
        matchStatus: WKL_MATCH_STATUS.MATCHED,
        contactId: batchDetail.contactId,
        batchDetailId: batchDetail.id,
        matchedBy: UPDATED_BY.SYSTEM,
        processedAt: new Date(),
      })
    } else {
      this.logger.warn(
        `WKL: unexpected status '${detail.status}' for contact ${batchDetail.contactId}, skipping`,
      )
      await this.persistWklRecord(ctx, detail, { matchStatus: WKL_MATCH_STATUS.SKIPPED })
      this.recordsWklSkipped++
      return
    }
  }

  private async persistWklRecord(
    ctx: WklRecordContext,
    detail: DetailRecord04,
    outcome: {
      matchStatus: (typeof WKL_MATCH_STATUS)[keyof typeof WKL_MATCH_STATUS]
      contactId?: number
      batchDetailId?: number
      matchedBy?: string
      processedAt?: Date
    },
  ): Promise<void> {
    await this.wklFileRecordService.persistRecord({
      transferFileId: ctx.transferFileId,
      recordIndex: ctx.recordIndex,
      weeklyFileDate: ctx.weeklyFileDate,
      recordData: detail,
      ...outcome,
    })
  }

  private async processUnmatchedWeeklyDetail(
    detail: DetailRecord04,
    contactId: number,
    caseNumber: string,
    header: HeaderRecord,
    batchDate: Date,
  ): Promise<{ contactId: number; batchDetailId: number } | null> {
    const unmatchedWklBatchId = { value: this.unmatchedWklBatchId }
    const counters = { approved: 0, refused: 0, skipped: 0 }
    const result = await this.wklAssociatedRecordProcessor.processAssociatedRecord(
      detail,
      contactId,
      caseNumber,
      {
        unmatchedWklBatchId,
        processedBatchIds: this.processedBatchIds,
        header,
        origin: 'PollCraResponseHandler.processUnmatchedWeeklyDetail',
        batchDate,
      },
      counters,
    )
    this.unmatchedWklBatchId = unmatchedWklBatchId.value
    this.recordsWklUnmatchedApproved += counters.approved
    this.recordsWklUnmatchedRefused += counters.refused
    this.recordsWklUnmatchedSkipped += counters.skipped
    return result
  }
}
