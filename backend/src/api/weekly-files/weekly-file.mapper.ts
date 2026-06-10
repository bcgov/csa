import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import type { DetailRecord04 } from 'src/cra/inbound/inbound-weekly.interface'
import { parseWklDate } from 'src/common/utils'
import type { WeeklyFileRecordDto, WeeklyFileSummaryDto } from './dto/weekly-file.dto'

const { WKL_MATCH_STATUS, WEEKLY_FILE } = CRA_DATA_HANDLING_CONSTANT
const { RECEIVE_MODE } = WEEKLY_FILE

export interface WeeklyFileCounts {
  totalCount: number
  eCount: number
  matchedCount: number
  unmatchedCount: number
  associatedCount: number
  weeklyFileDate: Date | null
}

export function aggregateWeeklyFileCounts(
  records: {
    matchStatus: string
    weeklyFileDate: Date | null
    recordData: unknown
  }[],
): WeeklyFileCounts {
  let weeklyFileDate: Date | null = null
  let eCount = 0
  let matchedCount = 0
  let unmatchedCount = 0
  let associatedCount = 0

  for (const record of records) {
    if (!weeklyFileDate && record.weeklyFileDate) {
      weeklyFileDate = record.weeklyFileDate
    }

    const data = record.recordData as DetailRecord04
    if (data.receiveMode === RECEIVE_MODE.ELECTQRONIC) {
      eCount++
    }

    if (record.matchStatus === WKL_MATCH_STATUS.MATCHED) {
      matchedCount++
    } else if (record.matchStatus === WKL_MATCH_STATUS.UNMATCHED) {
      unmatchedCount++
    } else if (record.matchStatus === WKL_MATCH_STATUS.ASSOCIATED) {
      associatedCount++
    }
  }

  return {
    totalCount: records.length,
    eCount,
    matchedCount,
    unmatchedCount,
    associatedCount,
    weeklyFileDate,
  }
}

export function toWeeklyFileSummaryDto(
  file: {
    id: number
    fileName: string
    deliveredAt: Date | null
    isDetailsProcessed: boolean
  },
  counts: WeeklyFileCounts,
): WeeklyFileSummaryDto {
  return {
    id: file.id,
    fileName: file.fileName,
    weeklyFileDate: formatDateOnly(counts.weeklyFileDate),
    csaProcessingDate: file.deliveredAt?.toISOString() ?? null,
    totalCount: counts.totalCount,
    eCount: counts.eCount,
    matchedCount: counts.matchedCount,
    unmatchedCount: counts.unmatchedCount,
    associatedCount: counts.associatedCount,
    isProcessed: file.isDetailsProcessed,
  }
}

export function toCsaMatchFound(matchStatus: string): 'Yes' | 'No' | 'N/A' {
  if (matchStatus === WKL_MATCH_STATUS.MATCHED) return 'Yes'
  if (matchStatus === WKL_MATCH_STATUS.UNMATCHED || matchStatus === WKL_MATCH_STATUS.ASSOCIATED) {
    return 'No'
  }
  return 'N/A'
}

export function toWeeklyFileRecordDto(record: {
  id: number
  recordIndex: number
  matchStatus: string
  matchedBy: string | null
  processedAt: Date | null
  recordData: unknown
  contact: { caseNumber: string; personIdIcm: string } | null
}): WeeklyFileRecordDto {
  const data = record.recordData as DetailRecord04

  return {
    id: record.id,
    recordIndex: record.recordIndex,
    csaMatchFound: toCsaMatchFound(record.matchStatus),
    matchStatus: record.matchStatus,
    transactionType: data.transactionType?.trim() ?? '',
    transactionSource:
      data.receiveMode === RECEIVE_MODE.ELECTQRONIC ? RECEIVE_MODE.ELECTQRONIC : '**',
    din: data.childDin?.trim() ?? '',
    firstName: data.childGivenName?.trim() ?? '',
    lastName: data.childSurName?.trim() ?? '',
    initial: data.childInitial?.trim() ?? '',
    gender: data.childSex?.trim() ?? '',
    dateOfBirth: formatWklDateString(data.childBirthDate),
    birthCity: data.childBirthCity?.trim() ?? '',
    birthProvince: data.childBirthProv?.trim() ?? '',
    birthCountry: data.childBirthCountry?.trim() ?? '',
    careStartDate: formatWklDateString(data.careStartDate),
    careEndDate: formatWklDateString(data.careEndDate),
    cancelReasonCode: data.careEndReasonCode?.trim() ?? '',
    craStatus: formatCraStatus(data.status),
    completionDate: formatWklDateString(data.completionDate),
    associatedCaseNumber: record.contact?.caseNumber ?? null,
    associatedPersonIdIcm: record.contact?.personIdIcm ?? null,
    matchedBy: record.matchedBy,
    processedAt: record.processedAt?.toISOString() ?? null,
  }
}

function formatDateOnly(date: Date | null | undefined): string | null {
  if (!date) return null
  return date.toISOString().slice(0, 10)
}

function formatWklDateString(value: string | undefined): string | null {
  if (!value?.trim()) return null
  const parsed = parseWklDate(value.trim())
  return parsed ? formatDateOnly(parsed) : null
}

function formatCraStatus(status: string | undefined): string {
  if (!status?.trim()) return ''
  return status.trim().toUpperCase().replace(/-/g, ' ')
}
