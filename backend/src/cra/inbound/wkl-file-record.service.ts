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
    const type = recordData.transactionType
    return type?.trim() || null
  }

  private extractCraStatus(recordData: DetailRecord04): string | null {
    const status = recordData.status?.trim()
    if (!status) return null
    // Normalize: lowercase, replace spaces with hyphens
    return status.toLowerCase().replace(/ +/g, '-')
  }

  private extractTransactionSource(recordData: DetailRecord04): string | null {
    const source = recordData.receiveMode?.trim().toUpperCase()
    if (!source) return 'other'
    if (source === 'E') return 'electronic'
    return source.toLowerCase()
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

    // Extract and transform filter values from recordData
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
