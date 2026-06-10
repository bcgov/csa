import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
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
  toWeeklyFileRecordDto,
  toWeeklyFileSummaryDto,
} from './weekly-file.mapper'

const { FILE_DIRECTION, FILE_TYPE, WEEKLY_FILE, WKL_MATCH_STATUS } = CRA_DATA_HANDLING_CONSTANT
const { RECEIVE_MODE } = WEEKLY_FILE

const weeklyFileWhere = {
  fileType: FILE_TYPE.WKL,
  direction: FILE_DIRECTION.INBOUND,
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
  ): Promise<PaginatedResponse<WeeklyFileRecordDto>> {
    await this.assertWeeklyFileExists(id)

    const safePage = page >= 1 ? page : 1
    const safeLimit = limit >= 1 ? Math.min(limit, 200) : 10

    const [total, records] = await Promise.all([
      this.prisma.wklFileRecord.count({ where: { transferFileId: id } }),
      this.prisma.wklFileRecord.findMany({
        where: { transferFileId: id },
        orderBy: { recordIndex: 'asc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        include: {
          contact: {
            select: {
              caseNumber: true,
              personIdIcm: true,
            },
          },
        },
      }),
    ])

    return {
      data: records.map(toWeeklyFileRecordDto),
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

    if (record.matchStatus !== WKL_MATCH_STATUS.UNMATCHED) {
      throw new BadRequestException('Only unmatched records can be associated')
    }

    if (record.processedAt || record.batchDetailId) {
      throw new BadRequestException('Cannot associate a record that has already been processed')
    }

    const detail = record.recordData as unknown as DetailRecord04
    if (detail.receiveMode !== RECEIVE_MODE.ELECTQRONIC) {
      throw new BadRequestException('Only electronic records can be associated')
    }

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
      include: {
        contact: {
          select: {
            caseNumber: true,
            personIdIcm: true,
          },
        },
      },
    })

    return toWeeklyFileRecordDto(updated)
  }

  async dissociateRecord(fileId: number, recordId: number): Promise<WeeklyFileRecordDto> {
    await this.assertWeeklyFileExists(fileId)
    const record = await this.getWklRecordForFile(fileId, recordId)

    if (record.matchStatus !== WKL_MATCH_STATUS.ASSOCIATED) {
      throw new BadRequestException('Only associated records can be dissociated')
    }

    const updated = await this.prisma.wklFileRecord.update({
      where: { id: recordId },
      data: {
        matchStatus: WKL_MATCH_STATUS.UNMATCHED,
        contactId: null,
        batchDetailId: null,
        matchedBy: null,
        processedAt: null,
      },
      include: {
        contact: {
          select: {
            caseNumber: true,
            personIdIcm: true,
          },
        },
      },
    })

    return toWeeklyFileRecordDto(updated)
  }

  async reprocess(fileId: number, userId: string): Promise<ReprocessWeeklyFileResultDto> {
    await this.assertWeeklyFileExists(fileId)

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

    const header = buildWklHeader(associatedRecords[0].weeklyFileDate)
    const unmatchedWklBatchId = { value: null as number | null }
    const processedBatchIds = new Set<number>()
    const counters = { approved: 0, refused: 0, skipped: 0 }
    const processedRecordIds: number[] = []
    const skippedRecords: { recordId: number; reason: string }[] = []

    for (const record of associatedRecords) {
      if (record.processedAt || record.batchDetailId) {
        skippedRecords.push({ recordId: record.id, reason: 'already_processed' })
        continue
      }

      if (!record.contact) {
        skippedRecords.push({ recordId: record.id, reason: 'missing_contact' })
        continue
      }

      const detail = record.recordData as unknown as DetailRecord04
      const result = await this.wklAssociatedRecordProcessor.processAssociatedRecord(
        detail,
        record.contact.id,
        record.contact.caseNumber,
        {
          unmatchedWklBatchId,
          processedBatchIds,
          header,
          origin: 'WeeklyFilesService.reprocess',
        },
        counters,
      )

      if (!result) {
        skippedRecords.push({ recordId: record.id, reason: 'processing_skipped' })
        continue
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

  private async getWklRecordForFile(fileId: number, recordId: number) {
    const record = await this.prisma.wklFileRecord.findFirst({
      where: { id: recordId, transferFileId: fileId },
      include: {
        contact: {
          select: {
            caseNumber: true,
            personIdIcm: true,
          },
        },
      },
    })

    if (!record) {
      throw new NotFoundException(`WKL record ${recordId} not found for weekly file ${fileId}`)
    }

    return record
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
