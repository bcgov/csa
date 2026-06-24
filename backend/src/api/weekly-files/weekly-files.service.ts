import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DateTime } from 'luxon'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { PrismaService } from 'src/common/database/prisma.service'
import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import type { DetailRecord04, HeaderRecord } from 'src/cra/inbound/inbound-weekly.interface'
import { RecordTypeCode, TranCode } from 'src/cra/inbound/inbound-weekly.interface'
import { WklAssociatedRecordProcessorService } from 'src/cra/inbound/wkl-associated-record-processor.service'
import { IcmSyncBackService } from 'src/sync/icm/icm-sync-back.service'
import { BatchesService } from '../batches/batches.service'
import type { ReprocessWeeklyFileResultDto } from './dto/associate-wkl-record.dto'
import type { WeeklyFileRecordDto, WeeklyFileSummaryDto } from './dto/weekly-file.dto'
import {
  aggregateWeeklyFileCounts,
  resolveCraStatusFilterToStored,
  toWeeklyFileRecordDto,
  toWeeklyFileSummaryDto,
} from './weekly-file.mapper'
import {
  assertCanAssociate,
  assertCanDissociate,
  assertCanReprocess,
} from './wkl-record.validation'

const { FILE_DIRECTION, FILE_TYPE, WKL_MATCH_STATUS } = CRA_DATA_HANDLING_CONSTANT

export interface WeeklyFileRecordFilters {
  csaMatchFound?: string[]
  transactionType?: string[]
  craStatus?: string[]
  matchedBy?: string
  batchNumber?: string
  transactionSource?: string
}

const TRANSACTION_TYPE_REVERSE: Record<string, string> = {
  Application: 'A',
  Cancellation: 'C',
  'CRA Update': 'U',
}

const weeklyFileWhere = {
  fileType: FILE_TYPE.WKL,
  direction: FILE_DIRECTION.INBOUND,
} as const

const wklRecordDtoInclude = {
  contact: {
    select: {
      id: true,
      caseNumber: true,
      personIdIcm: true,
    },
  },
  batchDetail: {
    select: {
      batch: {
        select: {
          batchNumber: true,
        },
      },
    },
  },
} as const

@Injectable()
export class WeeklyFilesService {
  private readonly logger = new Logger(WeeklyFilesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly batchesService: BatchesService,
    private readonly wklAssociatedRecordProcessor: WklAssociatedRecordProcessorService,
    private readonly icmSyncBackService: IcmSyncBackService,
  ) {}

  async findAll(page = 1, limit = 10): Promise<PaginatedResponse<WeeklyFileSummaryDto>> {
    const safePage = page >= 1 ? page : 1
    const safeLimit = limit >= 1 ? Math.min(limit, 200) : 10

    const [total, files] = await Promise.all([
      this.prisma.transferFile.count({ where: weeklyFileWhere }),
      this.prisma.transferFile.findMany({
        where: weeklyFileWhere,
        orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        select: {
          id: true,
          fileName: true,
          deliveredAt: true,
          isDetailsProcessed: true,
        },
      }),
    ])

    const fileIds = files.map((file) => file.id)
    const records =
      fileIds.length === 0
        ? []
        : await this.prisma.wklFileRecord.findMany({
            where: { transferFileId: { in: fileIds } },
            select: {
              transferFileId: true,
              matchStatus: true,
              weeklyFileDate: true,
              recordData: true,
            },
          })

    const recordsByFileId = new Map<number, typeof records>()
    for (const record of records) {
      const existing = recordsByFileId.get(record.transferFileId) ?? []
      existing.push(record)
      recordsByFileId.set(record.transferFileId, existing)
    }

    return {
      data: files.map((file) =>
        toWeeklyFileSummaryDto(file, aggregateWeeklyFileCounts(recordsByFileId.get(file.id) ?? [])),
      ),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    }
  }

  async findOne(id: number): Promise<WeeklyFileSummaryDto> {
    const file = await this.prisma.transferFile.findFirst({
      where: { id, ...weeklyFileWhere },
      select: {
        id: true,
        fileName: true,
        deliveredAt: true,
        isDetailsProcessed: true,
      },
    })

    if (!file) {
      throw new NotFoundException(`Weekly file ${id} not found`)
    }

    const records = await this.prisma.wklFileRecord.findMany({
      where: { transferFileId: id },
      select: {
        matchStatus: true,
        weeklyFileDate: true,
        recordData: true,
      },
    })

    return toWeeklyFileSummaryDto(file, aggregateWeeklyFileCounts(records))
  }

  async findRecords(
    id: number,
    page = 1,
    limit = 10,
    filters?: WeeklyFileRecordFilters,
  ): Promise<PaginatedResponse<WeeklyFileRecordDto>> {
    await this.assertWeeklyFileExists(id)

    const safePage = page >= 1 ? page : 1
    const safeLimit = limit >= 1 ? Math.min(limit, 200) : 10
    const offset = (safePage - 1) * safeLimit

    // Build WHERE conditions
    const whereConditions: string[] = [`transfer_file_id = ${id}`]

    // CSA Match Found filter (simple column-based)
    if (filters?.csaMatchFound?.length) {
      const matchStatuses: string[] = []
      for (const val of filters.csaMatchFound) {
        if (val === 'Yes') matchStatuses.push(WKL_MATCH_STATUS.MATCHED)
        if (val === 'No') {
          matchStatuses.push(WKL_MATCH_STATUS.UNMATCHED, WKL_MATCH_STATUS.ASSOCIATED)
        }
      }
      const uniqueStatuses = [...new Set(matchStatuses)]
      if (uniqueStatuses.length) {
        const statusList = uniqueStatuses.map((s) => `'${s}'`).join(',')
        whereConditions.push(`match_status IN (${statusList})`)
      }
    }

    // Transaction Type filter (column-based)
    if (filters?.transactionType?.length) {
      const rawTypes = filters.transactionType
        .map((v) => TRANSACTION_TYPE_REVERSE[v])
        .filter((v): v is string => !!v)
      if (rawTypes.length) {
        const typeList = rawTypes.map((t) => `'${t}'`).join(',')
        whereConditions.push(`transaction_type IN (${typeList})`)
      }
    }

    const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''")

    // CRA Status filter (column-based) — whitelist maps display labels to stored file values.
    if (filters?.craStatus?.length) {
      const storedStatuses = resolveCraStatusFilterToStored(filters.craStatus)
      if (storedStatuses.length) {
        const statusList = storedStatuses.map((s) => `'${escapeSqlLiteral(s)}'`).join(',')
        whereConditions.push(`cra_status IN (${statusList})`)
      }
    }

    // Matched By text filter (column-based)
    if (filters?.matchedBy) {
      const term = filters.matchedBy.trim().toLowerCase()
      if (term.length >= 3) {
        const escapedTerm = escapeSqlLiteral(term)
        whereConditions.push(`LOWER(COALESCE(matched_by, '')) LIKE '%${escapedTerm}%'`)
      }
    }

    // Batch Req ID text filter (batch number via relation)
    if (filters?.batchNumber) {
      const term = filters.batchNumber.trim().toLowerCase()
      if (term.length >= 1) {
        const escapedTerm = escapeSqlLiteral(term)
        whereConditions.push(`EXISTS (
          SELECT 1
          FROM csa.contact_batch_details cbd
          INNER JOIN csa.batches b ON b.id = cbd.batch_id
          WHERE cbd.id = csa.wkl_file_records.batch_detail_id
            AND LOWER(CAST(b.batch_number AS TEXT)) LIKE '%${escapedTerm}%'
        )`)
      }
    }

    // Transaction Source text filter (column-based)
    if (filters?.transactionSource) {
      const term = filters.transactionSource.trim().toLowerCase()
      if (term.length >= 3) {
        const escapedTerm = escapeSqlLiteral(term)
        whereConditions.push(`LOWER(
          CASE
            WHEN UPPER(COALESCE(transaction_source, '')) = 'E' THEN 'electronic'
            WHEN COALESCE(transaction_source, '') = '' THEN 'other'
            ELSE COALESCE(transaction_source, '')
          END
        ) LIKE '%${escapedTerm}%'`)
      }
    }

    const whereClause = whereConditions.join(' AND ')

    if (whereConditions.length === 1) {
      const [total, recordsWithRelations] = await Promise.all([
        this.prisma.wklFileRecord.count({ where: { transferFileId: id } }),
        this.prisma.wklFileRecord.findMany({
          where: { transferFileId: id },
          orderBy: { recordIndex: 'asc' },
          skip: offset,
          take: safeLimit,
          include: wklRecordDtoInclude,
        }),
      ])

      return {
        data: recordsWithRelations.map(toWeeklyFileRecordDto),
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      }
    }

    // Execute count and findMany using raw SQL for accurate filtering
    const countResult = await this.prisma.$queryRawUnsafe<
      Array<{ total: number | bigint | string }>
    >(`SELECT COUNT(*) as total FROM csa.wkl_file_records WHERE ${whereClause}`)

    const totalRaw = countResult[0]?.total ?? 0
    const total = typeof totalRaw === 'bigint' ? Number(totalRaw) : Number(totalRaw)

    interface WklFileRecordRow {
      id: number
      transfer_file_id: number
      record_index: number
      weekly_file_date: string | null
      record_data: unknown
      match_status: string
      contact_id: number | null
      batch_detail_id: number | null
      matched_by: string | null
      processed_at: string | null
      created_at: string
    }

    const recordsResult = await this.prisma.$queryRawUnsafe<WklFileRecordRow[]>(
      `SELECT id, transfer_file_id, record_index, weekly_file_date, record_data, match_status,
        contact_id, batch_detail_id, matched_by, processed_at, created_at
       FROM csa.wkl_file_records
       WHERE ${whereClause}
       ORDER BY record_index ASC
       LIMIT ${safeLimit} OFFSET ${offset}`,
    )

    // Fetch related data for the records (contact, batch) using Prisma
    const recordIds = recordsResult.map((r) => r.id)
    const recordsWithRelations =
      recordIds.length === 0
        ? []
        : await this.prisma.wklFileRecord.findMany({
            where: { id: { in: recordIds } },
            orderBy: { recordIndex: 'asc' },
            include: wklRecordDtoInclude,
          })

    return {
      data: recordsWithRelations.map(toWeeklyFileRecordDto),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    }
  }

  async associateRecord(
    fileId: number,
    recordId: number,
    contactId: number,
  ): Promise<WeeklyFileRecordDto> {
    await this.assertWeeklyFileExists(fileId)
    const record = await this.getWklRecordForFile(fileId, recordId)
    const detail = record.recordData as unknown as DetailRecord04
    assertCanAssociate(record, detail)

    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    })
    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`)
    }

    const updated = await this.prisma.wklFileRecord.update({
      where: { id: recordId },
      data: {
        matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
        contactId,
        batchDetailId: null,
        matchedBy: null,
        processedAt: null,
      },
      include: wklRecordDtoInclude,
    })

    return toWeeklyFileRecordDto(updated)
  }

  async dissociateRecord(fileId: number, recordId: number): Promise<WeeklyFileRecordDto> {
    await this.assertWeeklyFileExists(fileId)
    const record = await this.getWklRecordForFile(fileId, recordId)
    const detail = record.recordData as unknown as DetailRecord04
    assertCanDissociate(record, detail)

    const updated = await this.prisma.wklFileRecord.update({
      where: { id: recordId },
      data: {
        matchStatus: WKL_MATCH_STATUS.UNMATCHED,
        contactId: null,
        batchDetailId: null,
        matchedBy: null,
        processedAt: null,
      },
      include: wklRecordDtoInclude,
    })

    return toWeeklyFileRecordDto(updated)
  }

  async reprocessRecord(
    fileId: number,
    recordId: number,
    userId: string,
  ): Promise<WeeklyFileRecordDto> {
    const file = await this.getWeeklyFileForProcessing(fileId)
    const record = await this.getWklRecordForFile(fileId, recordId)
    const detail = record.recordData as unknown as DetailRecord04
    assertCanReprocess(record, detail)

    const contact = record.contact
    if (!contact) {
      throw new BadRequestException('Record has no associated contact to reprocess')
    }

    const processedBatchIds = new Set<number>()
    const result = await this.applyAssociatedRecordReprocess(
      {
        id: record.id,
        weeklyFileDate: record.weeklyFileDate,
        recordData: record.recordData,
        contact,
      },
      userId,
      { value: null },
      processedBatchIds,
      'WeeklyFilesService.reprocessRecord',
      undefined,
      csaProcessingBatchDate(file.deliveredAt),
    )

    if (!result) {
      throw new BadRequestException('Associated record could not be reprocessed')
    }

    for (const batchId of processedBatchIds) {
      await this.batchesService.aggregateBatchStatus(batchId)
    }

    try {
      await this.icmSyncBackService.syncFlaggedWithRetry()
    } catch (err) {
      this.logger.warn(`ICM sync-back failed after WKL record reprocess: ${(err as Error).message}`)
    }

    const updated = await this.prisma.wklFileRecord.findFirst({
      where: { id: recordId, transferFileId: fileId },
      include: wklRecordDtoInclude,
    })

    if (!updated) {
      throw new NotFoundException(`WKL record ${recordId} not found for weekly file ${fileId}`)
    }

    return toWeeklyFileRecordDto(updated)
  }

  async reprocess(fileId: number, userId: string): Promise<ReprocessWeeklyFileResultDto> {
    const file = await this.getWeeklyFileForProcessing(fileId)
    const batchDate = csaProcessingBatchDate(file.deliveredAt)

    const associatedRecords = await this.prisma.wklFileRecord.findMany({
      where: {
        transferFileId: fileId,
        matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
        processedAt: null,
        batchDetailId: null,
      },
      orderBy: { recordIndex: 'asc' },
      include: {
        contact: {
          select: {
            id: true,
            caseNumber: true,
          },
        },
      },
    })

    if (associatedRecords.length === 0) {
      throw new BadRequestException('No associated records to reprocess')
    }

    const unmatchedWklBatchId = { value: null as number | null }
    const processedBatchIds = new Set<number>()
    const processedRecordIds: number[] = []
    const skippedRecords: { recordId: number; reason: string }[] = []

    for (const record of associatedRecords) {
      try {
        const detail = record.recordData as unknown as DetailRecord04
        assertCanReprocess(record, detail)
      } catch {
        skippedRecords.push({ recordId: record.id, reason: 'not_reprocessable' })
        continue
      }

      if (!record.contact) {
        skippedRecords.push({ recordId: record.id, reason: 'missing_contact' })
        continue
      }

      const result = await this.applyAssociatedRecordReprocess(
        record,
        userId,
        unmatchedWklBatchId,
        processedBatchIds,
        'WeeklyFilesService.reprocess',
        undefined,
        batchDate,
      )

      if (!result) {
        skippedRecords.push({ recordId: record.id, reason: 'processing_skipped' })
        continue
      }

      processedRecordIds.push(record.id)
    }

    if (processedRecordIds.length === 0) {
      throw new BadRequestException('No associated records could be reprocessed')
    }

    for (const batchId of processedBatchIds) {
      await this.batchesService.aggregateBatchStatus(batchId)
    }

    try {
      await this.icmSyncBackService.syncFlaggedWithRetry()
    } catch (err) {
      this.logger.warn(`ICM sync-back failed after WKL reprocess: ${(err as Error).message}`)
    }

    return { processedRecordIds, skippedRecords }
  }

  private async applyAssociatedRecordReprocess(
    record: {
      id: number
      weeklyFileDate: Date | null
      recordData: unknown
      contact: { id: number; caseNumber: string }
    },
    userId: string,
    unmatchedWklBatchId: { value: number | null },
    processedBatchIds: Set<number>,
    origin: string,
    header?: HeaderRecord,
    batchDate?: Date,
  ): Promise<{ contactId: number; batchDetailId: number } | null> {
    const detail = record.recordData as unknown as DetailRecord04
    const wklHeader = header ?? buildWklHeader(record.weeklyFileDate)
    const counters = { approved: 0, refused: 0, skipped: 0 }

    const result = await this.wklAssociatedRecordProcessor.processAssociatedRecord(
      detail,
      record.contact.id,
      record.contact.caseNumber,
      {
        unmatchedWklBatchId,
        processedBatchIds,
        header: wklHeader,
        origin,
        preferExistingInProgressDetail: batchDate !== undefined,
        batchDate,
      },
      counters,
    )

    if (!result) {
      return null
    }

    await this.prisma.wklFileRecord.update({
      where: { id: record.id },
      data: {
        matchStatus: WKL_MATCH_STATUS.MATCHED,
        contactId: result.contactId,
        batchDetailId: result.batchDetailId,
        matchedBy: userId,
        processedAt: new Date(),
      },
    })

    return result
  }

  private async getWklRecordForFile(fileId: number, recordId: number) {
    const record = await this.prisma.wklFileRecord.findFirst({
      where: { id: recordId, transferFileId: fileId },
      include: wklRecordDtoInclude,
    })

    if (!record) {
      throw new NotFoundException(`WKL record ${recordId} not found for weekly file ${fileId}`)
    }

    return record
  }

  private async getWeeklyFileForProcessing(fileId: number) {
    const file = await this.prisma.transferFile.findFirst({
      where: { id: fileId, ...weeklyFileWhere },
      select: { id: true, deliveredAt: true },
    })

    if (!file) {
      throw new NotFoundException(`Weekly file ${fileId} not found`)
    }

    return file
  }

  private async assertWeeklyFileExists(id: number): Promise<void> {
    const file = await this.prisma.transferFile.findFirst({
      where: { id, ...weeklyFileWhere },
      select: { id: true },
    })

    if (!file) {
      throw new NotFoundException(`Weekly file ${id} not found`)
    }
  }
}

function buildWklHeader(weeklyFileDate: Date | null): HeaderRecord {
  const date = weeklyFileDate ?? new Date()
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return {
    tranCode: TranCode.HEADER,
    recordTypeCode: RecordTypeCode.HEADER,
    filler1: '',
    processDate: `${year}${month}${day}`,
    filler2: '',
  }
}

const PACIFIC_ZONE = 'America/Vancouver'

function csaProcessingBatchDate(deliveredAt: Date | null): Date {
  const isoDate = DateTime.fromJSDate(deliveredAt ?? new Date())
    .setZone(PACIFIC_ZONE)
    .toISODate()!
  return DateTime.fromISO(isoDate, { zone: PACIFIC_ZONE }).toJSDate()
}
