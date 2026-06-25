import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { PrismaService } from 'src/common/database/prisma.service'
import { csaProcessingBatchDate } from 'src/common/utils'
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
  normalizeCraStatusLabel,
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
  /** Semantic filter: "Yes" or "No" (maps to match_status groups). */
  csaMatchFound?: string[]
  /** Normalized display labels: Application, Cancellation, CRA Update. */
  transactionType?: string[]
  /** Normalized display labels: COMPLETED, ABANDONED, IN PROGRESS, UPDATED. */
  craStatus?: string[]
  matchedBy?: string
  batchNumber?: string
  transactionSource?: string
}

type WeeklyFileRecordSortColumn =
  | 'csaMatchFound'
  | 'matchedBy'
  | 'batchNumber'
  | 'transactionType'
  | 'transactionSource'
  | 'craStatus'

type WeeklyFileRecordSort = {
  column: WeeklyFileRecordSortColumn
  direction: 'asc' | 'desc'
}

const TRANSACTION_TYPE_FILTER_LABELS: Record<string, string> = {
  A: 'Application',
  APPLICATION: 'Application',
  C: 'Cancellation',
  CANCELLATION: 'Cancellation',
  U: 'CRA Update',
  'CRA UPDATE': 'CRA Update',
}

const ALLOWED_WEEKLY_RECORD_SORT_COLUMNS: WeeklyFileRecordSortColumn[] = [
  'csaMatchFound',
  'matchedBy',
  'batchNumber',
  'transactionType',
  'transactionSource',
  'craStatus',
]

function normalizeTransactionTypeLabel(value: string): string {
  const normalized = value.trim().toUpperCase()
  return TRANSACTION_TYPE_FILTER_LABELS[normalized] ?? value.trim()
}

function normalizeCsaMatchFoundLabel(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'yes') return 'Yes'
  if (normalized === 'no') return 'No'
  if (normalized === 'n/a') return 'N/A'
  return value.trim()
}

function parseWeeklyFileRecordSort(sort?: string): WeeklyFileRecordSort | null {
  if (!sort) {
    return null
  }

  let sortArray: unknown
  try {
    sortArray = JSON.parse(sort)
  } catch {
    throw new BadRequestException('Invalid JSON format for sort parameter')
  }

  if (!Array.isArray(sortArray) || sortArray.length === 0) {
    return null
  }

  const sortItem = sortArray[0]
  if (!sortItem || typeof sortItem !== 'object' || Array.isArray(sortItem)) {
    throw new BadRequestException('Sort parameter must contain objects with field directions')
  }

  const field = Object.keys(sortItem)[0] as WeeklyFileRecordSortColumn | undefined
  const direction =
    field && field in sortItem
      ? (sortItem[field as keyof typeof sortItem] as 'asc' | 'desc')
      : undefined

  if (!field || !ALLOWED_WEEKLY_RECORD_SORT_COLUMNS.includes(field)) {
    throw new BadRequestException(
      `Invalid sort field: ${field}. Allowed fields: ${ALLOWED_WEEKLY_RECORD_SORT_COLUMNS.join(', ')}`,
    )
  }

  if (direction !== 'asc' && direction !== 'desc') {
    throw new BadRequestException(`Invalid sort direction: ${direction}. Allowed values: asc, desc`)
  }

  return { column: field, direction }
}

function matchesTextFilter(
  value: string | null | undefined,
  term: string | undefined,
  minLength: number,
) {
  const normalizedTerm = term?.trim().toLowerCase() ?? ''
  if (!normalizedTerm || normalizedTerm.length < minLength) {
    return true
  }

  return (value ?? '').toLowerCase().includes(normalizedTerm)
}

function applyWeeklyFileRecordFilters(
  records: WeeklyFileRecordDto[],
  filters?: WeeklyFileRecordFilters,
): WeeklyFileRecordDto[] {
  const csaMatchFound = new Set((filters?.csaMatchFound ?? []).map(normalizeCsaMatchFoundLabel))
  const transactionTypes = new Set(
    (filters?.transactionType ?? []).map(normalizeTransactionTypeLabel).filter(Boolean),
  )
  const craStatuses = new Set(
    (filters?.craStatus ?? []).map(normalizeCraStatusLabel).filter(Boolean),
  )
  const batchNumberTerm = filters?.batchNumber?.trim().toLowerCase() ?? ''

  return records.filter((record) => {
    if (csaMatchFound.size > 0 && !csaMatchFound.has(record.csaMatchFound)) {
      return false
    }

    if (transactionTypes.size > 0 && !transactionTypes.has(record.transactionType)) {
      return false
    }

    if (craStatuses.size > 0 && !craStatuses.has(record.craStatus)) {
      return false
    }

    if (!matchesTextFilter(record.matchedBy, filters?.matchedBy, 3)) {
      return false
    }

    if (!matchesTextFilter(record.transactionSource, filters?.transactionSource, 3)) {
      return false
    }

    if (batchNumberTerm && batchNumberTerm.length >= 1) {
      const batchNumber = record.batchNumber?.toString() ?? ''
      if (!batchNumber.toLowerCase().includes(batchNumberTerm)) {
        return false
      }
    }

    return true
  })
}

function getWeeklyFileRecordSortValue(
  record: WeeklyFileRecordDto,
  column: WeeklyFileRecordSortColumn,
) {
  switch (column) {
    case 'batchNumber':
      return record.batchNumber ?? Number.POSITIVE_INFINITY
    case 'csaMatchFound':
      return record.csaMatchFound
    case 'matchedBy':
      return record.matchedBy ?? ''
    case 'transactionType':
      return record.transactionType
    case 'transactionSource':
      return record.transactionSource
    case 'craStatus':
      return record.craStatus
  }
}

function compareWeeklyFileRecordSortValues(left: string | number, right: string | number): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return String(left).localeCompare(String(right), undefined, { sensitivity: 'base' })
}

function sortWeeklyFileRecords(
  records: WeeklyFileRecordDto[],
  sort: WeeklyFileRecordSort | null,
): WeeklyFileRecordDto[] {
  if (!sort) {
    return records
  }

  return [...records].sort((left, right) => {
    const comparison = compareWeeklyFileRecordSortValues(
      getWeeklyFileRecordSortValue(left, sort.column),
      getWeeklyFileRecordSortValue(right, sort.column),
    )

    if (comparison !== 0) {
      return sort.direction === 'asc' ? comparison : -comparison
    }

    return left.recordIndex - right.recordIndex
  })
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
    sort?: string,
  ): Promise<PaginatedResponse<WeeklyFileRecordDto>> {
    await this.assertWeeklyFileExists(id)

    const safePage = page >= 1 ? page : 1
    const safeLimit = limit >= 1 ? Math.min(limit, 200) : 10
    const offset = (safePage - 1) * safeLimit

    const parsedSort = parseWeeklyFileRecordSort(sort)
    const recordsWithRelations = await this.prisma.wklFileRecord.findMany({
      where: { transferFileId: id },
      orderBy: { recordIndex: 'asc' },
      include: wklRecordDtoInclude,
    })

    const normalizedRecords = recordsWithRelations.map(toWeeklyFileRecordDto)
    const filteredRecords = applyWeeklyFileRecordFilters(normalizedRecords, filters)
    const sortedRecords = sortWeeklyFileRecords(filteredRecords, parsedSort)
    const paginatedRecords = sortedRecords.slice(offset, offset + safeLimit)
    const total = sortedRecords.length

    return {
      data: paginatedRecords,
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
