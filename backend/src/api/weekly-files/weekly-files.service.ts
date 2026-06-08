import { Injectable, NotFoundException } from '@nestjs/common'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { PrismaService } from 'src/common/database/prisma.service'
import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import type { WeeklyFileRecordDto, WeeklyFileSummaryDto } from './dto/weekly-file.dto'
import {
  aggregateWeeklyFileCounts,
  toWeeklyFileRecordDto,
  toWeeklyFileSummaryDto,
} from './weekly-file.mapper'

const { FILE_DIRECTION, FILE_TYPE } = CRA_DATA_HANDLING_CONSTANT

const weeklyFileWhere = {
  fileType: FILE_TYPE.WKL,
  direction: FILE_DIRECTION.INBOUND,
} as const

@Injectable()
export class WeeklyFilesService {
  constructor(private readonly prisma: PrismaService) {}

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
        toWeeklyFileSummaryDto(
          file,
          aggregateWeeklyFileCounts(recordsByFileId.get(file.id) ?? []),
        ),
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
