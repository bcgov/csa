import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import { describe, expect, it } from 'vitest'
import {
  aggregateWeeklyFileCounts,
  CRA_STATUS_DISPLAY_LABELS,
  resolveCraStatusFilterToStored,
  toCraStatusDisplayLabel,
  toCsaMatchFound,
  toWeeklyFileRecordDto,
} from './weekly-file.mapper'

const { WKL_MATCH_STATUS } = CRA_DATA_HANDLING_CONSTANT

describe('weekly-file.mapper', () => {
  const baseRecordData = {
    transactionType: 'A',
    receiveMode: 'E',
    childDin: '123456789',
    childGivenName: 'JOHN',
    childInitial: 'M',
    childSurName: 'DOE',
    childSex: 'M',
    childBirthDate: '20100315',
    childBirthCity: 'VANCOUVER',
    childBirthProv: 'BC',
    childBirthCountry: 'CA',
    careStartDate: '20250101',
    careEndDate: '        ',
    careEndReasonCode: '  ',
    status: 'completed',
    completionDate: '20250420',
  }

  it('aggregates total, e, matched, unmatched, and associated counts', () => {
    const counts = aggregateWeeklyFileCounts([
      {
        matchStatus: WKL_MATCH_STATUS.MATCHED,
        weeklyFileDate: new Date('2025-04-20'),
        recordData: baseRecordData,
      },
      {
        matchStatus: WKL_MATCH_STATUS.UNMATCHED,
        weeklyFileDate: new Date('2025-04-20'),
        recordData: { ...baseRecordData, receiveMode: 'E' },
      },
      {
        matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
        weeklyFileDate: new Date('2025-04-20'),
        recordData: { ...baseRecordData, receiveMode: 'E' },
      },
      {
        matchStatus: WKL_MATCH_STATUS.NA,
        weeklyFileDate: new Date('2025-04-20'),
        recordData: { ...baseRecordData, receiveMode: ' ' },
      },
    ])

    expect(counts).toEqual({
      totalCount: 4,
      eCount: 3,
      matchedCount: 1,
      unmatchedCount: 1,
      associatedCount: 1,
      weeklyFileDate: new Date('2025-04-20'),
    })
  })

  it('maps match status to CSA Match Found display values', () => {
    expect(toCsaMatchFound(WKL_MATCH_STATUS.MATCHED)).toBe('Yes')
    expect(toCsaMatchFound(WKL_MATCH_STATUS.UNMATCHED)).toBe('No')
    expect(toCsaMatchFound(WKL_MATCH_STATUS.ASSOCIATED)).toBe('No')
    expect(toCsaMatchFound(WKL_MATCH_STATUS.SKIPPED)).toBe('N/A')
    expect(toCsaMatchFound(WKL_MATCH_STATUS.NA)).toBe('N/A')
  })

  it('maps persisted record rows to API detail DTOs', () => {
    const dto = toWeeklyFileRecordDto({
      id: 10,
      recordIndex: 2,
      matchStatus: WKL_MATCH_STATUS.MATCHED,
      matchedBy: 'SYSTEM',
      processedAt: new Date('2025-04-21T12:00:00.000Z'),
      recordData: baseRecordData,
      contact: {
        caseNumber: '1-123',
        personIdIcm: 'ICM-1',
      },
      batchDetail: {
        batch: { batchNumber: 1042 },
      },
    })

    expect(dto).toMatchObject({
      id: 10,
      recordIndex: 2,
      csaMatchFound: 'Yes',
      transactionType: 'Application',
      transactionSource: 'Electronic',
      din: '123456789',
      firstName: 'JOHN',
      lastName: 'DOE',
      gender: 'Man / Boy',
      birthCountry: 'Canada',
      craStatus: 'COMPLETED',
      associatedCaseNumber: '1-123',
      associatedPersonIdIcm: 'ICM-1',
      batchNumber: 1042,
      matchedBy: 'SYSTEM',
    })
    expect(dto.dateOfBirth).toBe('2010-03-15')
  })

  it('maps non-electronic, update, unknown gender, and outside-canada values to display labels', () => {
    const dto = toWeeklyFileRecordDto({
      id: 11,
      recordIndex: 3,
      matchStatus: WKL_MATCH_STATUS.UNMATCHED,
      matchedBy: null,
      processedAt: null,
      recordData: {
        ...baseRecordData,
        transactionType: 'U',
        receiveMode: ' ',
        childSex: 'X',
        childBirthCountry: 'EX',
      },
      contact: null,
      batchDetail: null,
    })

    expect(dto.transactionType).toBe('CRA Update')
    expect(dto.transactionSource).toBe('Other')
    expect(dto.gender).toBe('Unknown')
    expect(dto.birthCountry).toBe('Outside Canada')
  })

  it('derives CRA status display labels from WEEKLY_FILE.STATUS', () => {
    expect(CRA_STATUS_DISPLAY_LABELS).toEqual(['COMPLETED', 'ABANDONED', 'IN PROGRESS', 'UPDATED'])
    expect(toCraStatusDisplayLabel('in-progress')).toBe('IN PROGRESS')
  })

  it('maps CRA status filter labels to stored file values', () => {
    expect(resolveCraStatusFilterToStored(['IN PROGRESS'])).toEqual(['in-progress'])
    expect(resolveCraStatusFilterToStored(['IN_PROGRESS', 'COMPLETED'])).toEqual([
      'in-progress',
      'completed',
    ])
    expect(resolveCraStatusFilterToStored(['INVALID', 'COMPLETED'])).toEqual(['completed'])
  })
})
