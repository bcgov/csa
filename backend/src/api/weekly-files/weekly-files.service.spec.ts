import { BadRequestException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import { WeeklyFilesService } from './weekly-files.service'

const { WKL_MATCH_STATUS } = CRA_DATA_HANDLING_CONSTANT

const electronicRecordData = {
  transactionType: 'C',
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
  careEndDate: '20250601',
  careEndReasonCode: '21',
  status: 'completed',
  completionDate: '20250420',
}

describe('WeeklyFilesService', () => {
  let service: WeeklyFilesService
  let mockPrisma: any
  let mockBatchesService: any
  let mockWklAssociatedRecordProcessor: any
  let mockIcmSyncBackService: any

  beforeEach(() => {
    mockPrisma = {
      transferFile: {
        count: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      wklFileRecord: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      contact: {
        findUnique: vi.fn(),
      },
    }

    mockBatchesService = {
      aggregateBatchStatus: vi.fn().mockResolvedValue(undefined),
    }

    mockWklAssociatedRecordProcessor = {
      processAssociatedRecord: vi.fn(),
    }

    mockIcmSyncBackService = {
      syncFlaggedWithRetry: vi.fn().mockResolvedValue({
        totalFlagged: 0,
        synced: 0,
        failed: 0,
        chunks: 0,
      }),
    }

    service = new WeeklyFilesService(
      mockPrisma,
      mockBatchesService,
      mockWklAssociatedRecordProcessor,
      mockIcmSyncBackService,
    )
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

  describe('associateRecord', () => {
    it('associates an unmatched electronic record with a contact', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
      mockPrisma.wklFileRecord.findFirst.mockResolvedValue({
        id: 5,
        matchStatus: WKL_MATCH_STATUS.UNMATCHED,
        recordData: electronicRecordData,
        contact: null,
      })
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 99 })
      mockPrisma.wklFileRecord.update.mockResolvedValue({
        id: 5,
        recordIndex: 0,
        matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
        matchedBy: 'JDOE',
        processedAt: null,
        recordData: electronicRecordData,
        contact: { caseNumber: '1-99', personIdIcm: 'ICM-99' },
      })

      const result = await service.associateRecord(1, 5, 99, 'JDOE')

      expect(mockPrisma.wklFileRecord.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
          contactId: 99,
          batchDetailId: null,
          matchedBy: 'JDOE',
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
      expect(result.matchStatus).toBe(WKL_MATCH_STATUS.ASSOCIATED)
      expect(result.associatedCaseNumber).toBe('1-99')
    })

    it('rejects association when record is not unmatched', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
      mockPrisma.wklFileRecord.findFirst.mockResolvedValue({
        id: 5,
        matchStatus: WKL_MATCH_STATUS.MATCHED,
        recordData: electronicRecordData,
        contact: null,
      })

      await expect(service.associateRecord(1, 5, 99, 'JDOE')).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('rejects association when record was already processed', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
      mockPrisma.wklFileRecord.findFirst.mockResolvedValue({
        id: 5,
        matchStatus: WKL_MATCH_STATUS.UNMATCHED,
        processedAt: new Date('2025-04-21T12:00:00.000Z'),
        batchDetailId: 600,
        recordData: electronicRecordData,
        contact: null,
      })

      await expect(service.associateRecord(1, 5, 99, 'JDOE')).rejects.toThrow(
        'Cannot associate a record that has already been processed',
      )
    })
  })

  describe('dissociateRecord', () => {
    it('dissociates an associated record back to unmatched', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
      mockPrisma.wklFileRecord.findFirst.mockResolvedValue({
        id: 5,
        matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
        recordData: electronicRecordData,
        contact: { caseNumber: '1-99', personIdIcm: 'ICM-99' },
      })
      mockPrisma.wklFileRecord.update.mockResolvedValue({
        id: 5,
        recordIndex: 0,
        matchStatus: WKL_MATCH_STATUS.UNMATCHED,
        matchedBy: null,
        processedAt: null,
        recordData: electronicRecordData,
        contact: null,
      })

      const result = await service.dissociateRecord(1, 5)

      expect(mockPrisma.wklFileRecord.update).toHaveBeenCalledWith({
        where: { id: 5 },
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
      expect(result.matchStatus).toBe(WKL_MATCH_STATUS.UNMATCHED)
    })
  })

  describe('reprocess', () => {
    it('reprocesses associated records and returns processed ids', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
      mockPrisma.wklFileRecord.findMany.mockResolvedValue([
        {
          id: 5,
          recordIndex: 0,
          weeklyFileDate: new Date('2025-04-20'),
          recordData: electronicRecordData,
          contact: { id: 99, caseNumber: '1-99' },
        },
      ])
      mockWklAssociatedRecordProcessor.processAssociatedRecord.mockImplementation(
        async (_detail, _contactId, _caseNumber, ctx) => {
          ctx.processedBatchIds.add(500)
          return { contactId: 99, batchDetailId: 600 }
        },
      )
      mockPrisma.wklFileRecord.update.mockResolvedValue({})

      const result = await service.reprocess(1, 'JDOE')

      expect(mockPrisma.wklFileRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
            processedAt: null,
            batchDetailId: null,
          }),
        }),
      )
      expect(mockWklAssociatedRecordProcessor.processAssociatedRecord).toHaveBeenCalledTimes(1)
      expect(mockPrisma.wklFileRecord.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          matchStatus: WKL_MATCH_STATUS.MATCHED,
          contactId: 99,
          batchDetailId: 600,
          matchedBy: 'JDOE',
          processedAt: expect.any(Date),
        },
      })
      expect(mockBatchesService.aggregateBatchStatus).toHaveBeenCalledWith(500)
      expect(mockIcmSyncBackService.syncFlaggedWithRetry).toHaveBeenCalled()
      expect(result).toEqual({ processedRecordIds: [5], skippedRecords: [] })
    })

    it('throws when there are no associated records to reprocess', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
      mockPrisma.wklFileRecord.findMany.mockResolvedValue([])

      await expect(service.reprocess(1, 'JDOE')).rejects.toBeInstanceOf(BadRequestException)
    })

  })
})
