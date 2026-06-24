import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service'
import type { DetailRecord04 } from './inbound-weekly.interface'

export type WklMatchStatus = 'matched' | 'unmatched' | 'associated' | 'skipped' | 'na'

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

  private extractTransactionType(recordData: DetailRecord04): string | null {
    if (recordData.transactionType === undefined || recordData.transactionType === null) {
      return null
    }
    return recordData.transactionType.trim()
  }

  private extractCraStatus(recordData: DetailRecord04): string | null {
    if (recordData.status === undefined || recordData.status === null) {
      return null
    }
    return recordData.status.trim()
  }

  private extractTransactionSource(recordData: DetailRecord04): string | null {
    if (recordData.receiveMode === undefined || recordData.receiveMode === null) {
      return null
    }
    return recordData.receiveMode.trim()
  }

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

    // Persist raw file values; display/query transformations happen in the API layer.
    const transactionType = this.extractTransactionType(recordData)
    const craStatus = this.extractCraStatus(recordData)
    const transactionSource = this.extractTransactionSource(recordData)

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
        transactionType,
        craStatus,
        transactionSource,
        matchStatus,
        contactId,
        batchDetailId,
        matchedBy,
        processedAt,
      },
      update: {
        weeklyFileDate,
        recordData: recordData as unknown as Prisma.InputJsonValue,
        transactionType,
        craStatus,
        transactionSource,
        matchStatus,
        contactId,
        batchDetailId,
        matchedBy,
        processedAt,
      },
    })
  }
}
