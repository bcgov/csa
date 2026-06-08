import { NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WeeklyFilesService } from './weekly-files.service'

describe('WeeklyFilesService', () => {
  let service: WeeklyFilesService
  let mockPrisma: any

  beforeEach(() => {
    mockPrisma = {
      transferFile: {
        count: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      wklFileRecord: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    }

    service = new WeeklyFilesService(mockPrisma)
  })

  it('returns paginated weekly file summaries with counts', async () => {
    mockPrisma.transferFile.count.mockResolvedValue(1)
    mockPrisma.transferFile.findMany.mockResolvedValue([
      {
        id: 1,
        fileName: 'craUserId.AWKL0001.txt',
        deliveredAt: new Date('2025-04-21T10:00:00.000Z'),
        isDetailsProcessed: true,
      },
    ])
    mockPrisma.wklFileRecord.findMany.mockResolvedValue([
      {
        transferFileId: 1,
        matchStatus: 'matched',
        weeklyFileDate: new Date('2025-04-20'),
        recordData: { receiveMode: 'E' },
      },
      {
        transferFileId: 1,
        matchStatus: 'unmatched',
        weeklyFileDate: new Date('2025-04-20'),
        recordData: { receiveMode: 'E' },
      },
      {
        transferFileId: 1,
        matchStatus: 'na',
        weeklyFileDate: new Date('2025-04-20'),
        recordData: { receiveMode: ' ' },
      },
    ])

    const result = await service.findAll(1, 10)

    expect(result.total).toBe(1)
    expect(result.data[0]).toMatchObject({
      id: 1,
      fileName: 'craUserId.AWKL0001.txt',
      weeklyFileDate: '2025-04-20',
      totalCount: 3,
      eCount: 2,
      matchedCount: 1,
      unmatchedCount: 1,
      isProcessed: true,
    })
  })

  it('throws when weekly file is not found', async () => {
    mockPrisma.transferFile.findFirst.mockResolvedValue(null)

    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('returns paginated detail records for a weekly file', async () => {
    mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.wklFileRecord.findMany.mockResolvedValue([
        {
          id: 5,
          recordIndex: 0,
          matchStatus: 'unmatched',
          matchedBy: null,
          processedAt: null,
          recordData: {
            transactionType: 'A',
            receiveMode: 'E',
            childDin: '123456789',
            childGivenName: 'JOHN',
            childInitial: ' ',
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
          },
          contact: null,
        },
      ])
    mockPrisma.wklFileRecord.count.mockResolvedValue(1)

    const result = await service.findRecords(1, 1, 10)

    expect(result.total).toBe(1)
    expect(result.data[0]).toMatchObject({
      id: 5,
      csaMatchFound: 'No',
      din: '123456789',
      firstName: 'JOHN',
      lastName: 'DOE',
    })
  })
})
