import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service'
import type { DetailRecord04 } from './inbound-weekly.interface'

export type WklMatchStatus = 'matched' | 'unmatched' | 'skipped' | 'na'

export interface PersistWklRecordParams {
  transferFileId: number
  recordIndex: number
  weeklyFileDate: Date | null
  recordData: DetailRecord04
  matchStatus: WklMatchStatus
  contactId?: number
  batchDetailId?: number
  matchedBy?: string
  processedAt?: Date
}

@Injectable()
export class WklFileRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async persistRecord(params: PersistWklRecordParams): Promise<void> {
    const {
      transferFileId,
      recordIndex,
      weeklyFileDate,
      recordData,
      matchStatus,
      contactId,
      batchDetailId,
      matchedBy,
      processedAt,
    } = params

    await this.prisma.wklFileRecord.upsert({
      where: {
        wkl_file_record_unique: {
          transferFileId,
          recordIndex,
        },
      },
      create: {
        transferFileId,
        recordIndex,
        weeklyFileDate,
        recordData: recordData as unknown as Prisma.InputJsonValue,
        matchStatus,
        contactId,
        batchDetailId,
        matchedBy,
        processedAt,
      },
      update: {
        weeklyFileDate,
        recordData: recordData as unknown as Prisma.InputJsonValue,
        matchStatus,
        contactId,
        batchDetailId,
        matchedBy,
        processedAt,
      },
    })
  }
}
