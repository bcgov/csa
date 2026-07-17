import { Prisma } from '@prisma/client'
import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import type { PrismaService } from 'src/common/database/prisma.service'
import { filterAllowedCraStatuses, filterAllowedTransactionTypes } from './weekly-file.mapper'
import type { WeeklyFileRecordFilters } from './weekly-files.service'

const { WKL_MATCH_STATUS } = CRA_DATA_HANDLING_CONSTANT

export function resolveCsaMatchFoundStatuses(values: string[]): string[] {
  const matchStatuses: string[] = []
  for (const val of values) {
    if (val === 'Yes') matchStatuses.push(WKL_MATCH_STATUS.MATCHED)
    if (val === 'No') {
      matchStatuses.push(WKL_MATCH_STATUS.UNMATCHED, WKL_MATCH_STATUS.ASSOCIATED)
    }
  }
  return [...new Set(matchStatuses)]
}

/** Maps a search term to stored transaction_source values (display: electronic / other). */
export function buildTransactionSourceWhere(
  term: string | undefined,
): Prisma.WklFileRecordWhereInput | null {
  const normalized = term?.trim().toLowerCase() ?? ''
  if (normalized.length < 3) return null

  const orConditions: Prisma.WklFileRecordWhereInput[] = []
  if ('electronic'.includes(normalized)) {
    orConditions.push({ transactionSource: 'E' })
  }
  if ('other'.includes(normalized)) {
    orConditions.push({ OR: [{ transactionSource: '' }, { transactionSource: null }] })
  }
  if (!orConditions.length) {
    orConditions.push({ transactionSource: { contains: normalized, mode: 'insensitive' } })
  }
  return { OR: orConditions }
}

async function findBatchDetailIdsByBatchNumberSubstring(
  prisma: PrismaService,
  term: string,
): Promise<number[]> {
  const pattern = `%${term}%`
  const rows = await prisma.$queryRaw<{ id: number }[]>(
    Prisma.sql`
      SELECT cbd.id
      FROM csa.contact_batch_details cbd
      INNER JOIN csa.batches b ON b.id = cbd.batch_id
      WHERE LOWER(CAST(b.batch_number AS TEXT)) LIKE ${pattern}
    `,
  )
  return rows.map((row) => row.id)
}

export async function buildWklRecordWhereInput(
  prisma: PrismaService,
  transferFileId: number,
  filters?: WeeklyFileRecordFilters,
): Promise<Prisma.WklFileRecordWhereInput> {
  const andConditions: Prisma.WklFileRecordWhereInput[] = []

  if (filters?.csaMatchFound?.length) {
    const matchStatuses = resolveCsaMatchFoundStatuses(filters.csaMatchFound)
    if (matchStatuses.length) {
      andConditions.push({ matchStatus: { in: matchStatuses } })
    }
  }

  const transactionTypes = filterAllowedTransactionTypes(filters?.transactionType ?? [])
  if (transactionTypes.length) {
    andConditions.push({ transactionType: { in: transactionTypes } })
  }

  const craStatuses = filterAllowedCraStatuses(filters?.craStatus ?? [])
  if (craStatuses.length) {
    andConditions.push({ craStatus: { in: craStatuses } })
  }

  if (filters?.matchedBy?.trim()) {
    const term = filters.matchedBy.trim()
    if (term.length >= 3) {
      andConditions.push({ matchedBy: { contains: term, mode: 'insensitive' } })
    }
  }

  const transactionSourceWhere = buildTransactionSourceWhere(filters?.transactionSource)
  if (transactionSourceWhere) {
    andConditions.push(transactionSourceWhere)
  }

  if (filters?.batchNumber?.trim()) {
    const term = filters.batchNumber.trim().toLowerCase()
    if (term.length >= 1) {
      const batchDetailIds = await findBatchDetailIdsByBatchNumberSubstring(prisma, term)
      andConditions.push({ batchDetailId: { in: batchDetailIds } })
    }
  }

  return {
    transferFileId,
    ...(andConditions.length ? { AND: andConditions } : {}),
  }
}
