import { existsSync } from 'fs'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'
import { parseWklDate } from 'src/common/utils'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import { InboundFileService } from './inbound-file.service'
import { InboundWeeklyResponseService } from './inbound-weekly-response.service'
import type { DetailRecord04 } from './inbound-weekly.interface'
import {
  SnapshotBatchDetailCandidate,
  WeeklyContactMatcherService,
} from './weekly-contact-matcher.service'
import type { WklMatchStatus } from './wkl-file-record.service'
import { WklFileRecordService } from './wkl-file-record.service'

const { DESTINATION_ID, FILE_DIRECTION, FILE_TYPE, UPDATED_BY, WEEKLY_FILE, WKL_MATCH_STATUS } =
  CRA_DATA_HANDLING_CONSTANT
const { STATUS: WKL_STATUS, RECEIVE_MODE, TRANSACTION_TYPE_MAP, TRANSACTION_TYPES } = WEEKLY_FILE

export interface WklFileBackfillFileResult {
  transferFileId: number
  fileName: string
  recordsUpserted: number
  skippedReason?: string
}

export interface WklFileBackfillResult {
  filesProcessed: number
  filesSkipped: number
  recordsUpserted: number
  fileResults: WklFileBackfillFileResult[]
}

interface ClassifiedWklRecord {
  matchStatus: WklMatchStatus
  contactId?: number
  batchDetailId?: number
  matchedBy?: string
  processedAt?: Date
}

@Injectable()
export class WklFileRecordBackfillService {
  private readonly logger = new Logger(WklFileRecordBackfillService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboundFileService: InboundFileService,
    private readonly inboundWeeklyResponseService: InboundWeeklyResponseService,
    private readonly weeklyContactMatcher: WeeklyContactMatcherService,
    private readonly wklFileRecordService: WklFileRecordService,
  ) {}

  async backfillAll(): Promise<WklFileBackfillResult> {
    const files = await this.findFilesNeedingBackfill()
    const snapshotCandidates = await this.weeklyContactMatcher.findAllSnapshotBatchDetails()
    this.logger.log(
      `WKL backfill: ${files.length} file(s) to process, ${snapshotCandidates.length} snapshot batch detail candidate(s) loaded`,
    )

    const fileResults: WklFileBackfillFileResult[] = []
    let filesProcessed = 0
    let filesSkipped = 0
    let recordsUpserted = 0

    for (const file of files) {
      const result = await this.backfillFile(file, snapshotCandidates)
      fileResults.push(result)
      if (result.skippedReason) {
        filesSkipped++
      } else {
        filesProcessed++
        recordsUpserted += result.recordsUpserted
      }
    }

    return { filesProcessed, filesSkipped, recordsUpserted, fileResults }
  }

  async findFilesNeedingBackfill() {
    return this.prisma.transferFile.findMany({
      where: {
        direction: FILE_DIRECTION.INBOUND,
        isDetailsProcessed: true,
        OR: [{ fileType: FILE_TYPE.WKL }, { fileName: { contains: 'WKL' } }],
        wklFileRecords: { none: {} },
      },
      orderBy: [{ deliveredAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        fileName: true,
        deliveredAt: true,
      },
    })
  }

  async backfillFile(
    file: { id: number; fileName: string; deliveredAt: Date | null },
    snapshotCandidates: SnapshotBatchDetailCandidate[],
  ): Promise<WklFileBackfillFileResult> {
    const localFilePath = this.inboundFileService.getLocalFilePath(DESTINATION_ID, file.fileName)
    if (!existsSync(localFilePath)) {
      const skippedReason = `Inbound file not found at ${localFilePath}`
      this.logger.warn(`Skipping WKL backfill for ${file.fileName}: ${skippedReason}`)
      return {
        transferFileId: file.id,
        fileName: file.fileName,
        recordsUpserted: 0,
        skippedReason,
      }
    }

    let parsed: ReturnType<InboundWeeklyResponseService['parseWeeklyResponseFile']>
    try {
      parsed = this.inboundWeeklyResponseService.parseWeeklyResponseFile(localFilePath)
    } catch (error) {
      const skippedReason = `Failed to parse file: ${(error as Error).message}`
      this.logger.warn(`Skipping WKL backfill for ${file.fileName}: ${skippedReason}`)
      return {
        transferFileId: file.id,
        fileName: file.fileName,
        recordsUpserted: 0,
        skippedReason,
      }
    }

    const weeklyFileDate = parseWklDate(parsed.header.processDate) ?? null
    const processedAt = file.deliveredAt ?? new Date()
    let recordsUpserted = 0

    for (let recordIndex = 0; recordIndex < parsed.details.length; recordIndex++) {
      const detail = parsed.details[recordIndex]
      const classified = await this.classifyDetail(
        detail,
        weeklyFileDate,
        processedAt,
        snapshotCandidates,
      )

      await this.wklFileRecordService.persistRecord({
        transferFileId: file.id,
        recordIndex,
        weeklyFileDate,
        recordData: detail,
        ...classified,
      })
      recordsUpserted++
    }

    this.logger.log(`Backfilled ${recordsUpserted} WKL record(s) for ${file.fileName}`)
    return {
      transferFileId: file.id,
      fileName: file.fileName,
      recordsUpserted,
    }
  }

  private async classifyDetail(
    detail: DetailRecord04,
    weeklyFileDate: Date | null,
    processedAt: Date,
    snapshotCandidates: SnapshotBatchDetailCandidate[],
  ): Promise<ClassifiedWklRecord> {
    if (detail.receiveMode !== RECEIVE_MODE.ELECTQRONIC) {
      return { matchStatus: WKL_MATCH_STATUS.NA }
    }

    if (detail.status?.toLocaleLowerCase() === WKL_STATUS.IN_PROGRESS) {
      return { matchStatus: WKL_MATCH_STATUS.NA }
    }

    const wklType = TRANSACTION_TYPE_MAP[detail.transactionType]
    if (!wklType || !TRANSACTION_TYPES.includes(wklType)) {
      return { matchStatus: WKL_MATCH_STATUS.SKIPPED }
    }

    const status = detail.status?.trim().toLowerCase()
    const isApproved = status === WKL_STATUS.COMPLETED || status === WKL_STATUS.UPDATED
    const isRefused = status === WKL_STATUS.ABANDONED
    const hasProcessableStatus = isApproved || isRefused

    const batchDetail = this.weeklyContactMatcher.matchBatchDetailFromCandidates(
      snapshotCandidates,
      detail,
    )
    if (batchDetail) {
      if (!hasProcessableStatus) {
        return { matchStatus: WKL_MATCH_STATUS.SKIPPED }
      }
      return {
        matchStatus: WKL_MATCH_STATUS.MATCHED,
        contactId: batchDetail.contactId,
        batchDetailId: batchDetail.id,
        matchedBy: UPDATED_BY.SYSTEM,
        processedAt,
      }
    }

    const contact = await this.weeklyContactMatcher.findMatchingContact(detail)
    if (!contact) {
      return { matchStatus: WKL_MATCH_STATUS.UNMATCHED }
    }

    if (!hasProcessableStatus) {
      return { matchStatus: WKL_MATCH_STATUS.SKIPPED }
    }

    if (!weeklyFileDate) {
      return { matchStatus: WKL_MATCH_STATUS.UNMATCHED }
    }

    const craBatchDetail = await this.weeklyContactMatcher.findCraBatchDetailForContact(
      contact.id,
      weeklyFileDate,
      detail,
    )
    if (craBatchDetail) {
      return {
        matchStatus: WKL_MATCH_STATUS.MATCHED,
        contactId: craBatchDetail.contactId,
        batchDetailId: craBatchDetail.id,
        matchedBy: UPDATED_BY.SYSTEM,
        processedAt,
      }
    }

    return { matchStatus: WKL_MATCH_STATUS.UNMATCHED }
  }
}
