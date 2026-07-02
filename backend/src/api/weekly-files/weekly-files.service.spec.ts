import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CRA_DATA_HANDLING_CONSTANT } from 'src/cra/cra.constant'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WeeklyFilesService } from './weekly-files.service'

const { WKL_MATCH_STATUS } = CRA_DATA_HANDLING_CONSTANT

const wklRecordDtoInclude = {
  contact: {
    select: {
      id: true,
      caseNumber: true,
      personIdIcm: true,
    },
  },
  batchDetail: {
    select: {
      batch: {
        select: {
          batchNumber: true,
        },
      },
    },
  },
} as const

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
      $queryRaw: vi.fn(),
      wklFileRecord: {
        findMany: vi.fn(),
        groupBy: vi.fn(),
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

  it('sorts weekly file summaries by csaProcessingDate using database order', async () => {
    mockPrisma.transferFile.count.mockResolvedValue(2)
    mockPrisma.transferFile.findMany.mockResolvedValue([
      {
        id: 2,
        fileName: 'craUserId.AWKL0002.txt',
        deliveredAt: new Date('2025-04-20T10:00:00.000Z'),
        isDetailsProcessed: true,
      },
      {
        id: 1,
        fileName: 'craUserId.AWKL0001.txt',
        deliveredAt: new Date('2025-04-21T10:00:00.000Z'),
        isDetailsProcessed: true,
      },
    ])
    mockPrisma.wklFileRecord.findMany.mockResolvedValue([])

    const result = await service.findAll(1, 10, '[{"csaProcessingDate":"asc"}]')

    expect(mockPrisma.transferFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ deliveredAt: 'asc' }, { id: 'asc' }],
      }),
    )
    expect(result.data.map((file) => file.id)).toEqual([2, 1])
  })

  it('sorts weekly file summaries by weeklyFileDate using SQL order', async () => {
    mockPrisma.transferFile.count.mockResolvedValue(3)
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        id: 2,
        fileName: 'craUserId.AWKL0002.txt',
        deliveredAt: new Date('2025-04-20T10:00:00.000Z'),
        isDetailsProcessed: true,
      },
      {
        id: 1,
        fileName: 'craUserId.AWKL0001.txt',
        deliveredAt: new Date('2025-04-21T10:00:00.000Z'),
        isDetailsProcessed: true,
      },
    ])
    mockPrisma.wklFileRecord.findMany.mockResolvedValue([])

    const result = await service.findAll(1, 2, '[{"weeklyFileDate":"asc"}]')

    expect(mockPrisma.$queryRaw).toHaveBeenCalled()
    expect(mockPrisma.wklFileRecord.groupBy).not.toHaveBeenCalled()
    expect(result.data.map((file) => file.id)).toEqual([2, 1])
  })

  it('uses sort-direction tie-break for weeklyFileDate summary sort', async () => {
    mockPrisma.transferFile.count.mockResolvedValue(2)
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 1,
          fileName: 'craUserId.AWKL0001.txt',
          deliveredAt: new Date('2025-04-20T10:00:00.000Z'),
          isDetailsProcessed: true,
        },
        {
          id: 2,
          fileName: 'craUserId.AWKL0002.txt',
          deliveredAt: new Date('2025-04-20T10:00:00.000Z'),
          isDetailsProcessed: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 2,
          fileName: 'craUserId.AWKL0002.txt',
          deliveredAt: new Date('2025-04-20T10:00:00.000Z'),
          isDetailsProcessed: true,
        },
        {
          id: 1,
          fileName: 'craUserId.AWKL0001.txt',
          deliveredAt: new Date('2025-04-20T10:00:00.000Z'),
          isDetailsProcessed: true,
        },
      ])
    mockPrisma.wklFileRecord.findMany.mockResolvedValue([])

    const ascResult = await service.findAll(1, 10, '[{"weeklyFileDate":"asc"}]')
    const descResult = await service.findAll(1, 10, '[{"weeklyFileDate":"desc"}]')

    expect(ascResult.data.map((file) => file.id)).toEqual([1, 2])
    expect(descResult.data.map((file) => file.id)).toEqual([2, 1])
  })

  it('throws for invalid weekly summary sort field', async () => {
    await expect(service.findAll(1, 10, '[{"invalidField":"asc"}]')).rejects.toBeInstanceOf(
      BadRequestException,
    )
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

  it('filters detail records using normalized display labels', async () => {
    mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.wklFileRecord.findMany.mockResolvedValue([
      {
        id: 5,
        recordIndex: 0,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          transactionType: 'U',
          status: ';COMPLETED',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 1042 } },
      },
      {
        id: 6,
        recordIndex: 1,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          transactionType: 'C',
          status: 'abandoned',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 1043 } },
      },
    ])

    const result = await service.findRecords(1, 1, 10, {
      transactionType: ['Update'],
      craStatus: ['COMPLETED'],
    })

    expect(result.total).toBe(1)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      id: 5,
      transactionType: 'Update',
      craStatus: 'COMPLETED',
    })
  })

  it('filters N/A csa match found values', async () => {
    mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.wklFileRecord.findMany.mockResolvedValue([
      {
        id: 5,
        recordIndex: 0,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          status: 'completed',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 1042 } },
      },
      {
        id: 6,
        recordIndex: 1,
        matchStatus: 'skipped',
        matchedBy: null,
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          status: 'completed',
        },
        contact: null,
        batchDetail: null,
      },
    ])

    const result = await service.findRecords(1, 1, 10, {
      csaMatchFound: ['N/A'],
    })

    expect(result.total).toBe(1)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      id: 6,
      csaMatchFound: 'N/A',
    })
  })

  it('filters IN PROGRESS cra status using normalized display label', async () => {
    mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.wklFileRecord.findMany.mockResolvedValue([
      {
        id: 5,
        recordIndex: 0,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          status: 'IN PROGRESS',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 1042 } },
      },
      {
        id: 6,
        recordIndex: 1,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          status: ';inprogress',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 1043 } },
      },
      {
        id: 7,
        recordIndex: 2,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          status: 'completed',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 1044 } },
      },
    ])

    const result = await service.findRecords(1, 1, 10, {
      craStatus: ['IN PROGRESS'],
    })

    expect(result.total).toBe(2)
    expect(result.data.map((record) => record.id)).toEqual([5, 6])
    expect(result.data.every((record) => record.craStatus === 'IN PROGRESS')).toBe(true)
  })

  it('filters COMPLETED cra status and includes ;COMPLETED while excluding other statuses', async () => {
    mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.wklFileRecord.findMany.mockResolvedValue([
      {
        id: 8,
        recordIndex: 0,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          status: ';COMPLETED',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 2001 } },
      },
      {
        id: 9,
        recordIndex: 1,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          status: 'complete',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 2002 } },
      },
      {
        id: 10,
        recordIndex: 2,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          status: 'IN PROGRESS',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 2003 } },
      },
      {
        id: 11,
        recordIndex: 3,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          status: 'abandoned',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 2004 } },
      },
    ])

    const result = await service.findRecords(1, 1, 10, {
      craStatus: ['COMPLETED'],
    })

    expect(result.total).toBe(2)
    expect(result.data.map((record) => record.id)).toEqual([8, 9])
    expect(result.data.every((record) => record.craStatus === 'COMPLETED')).toBe(true)
  })

  it('sorts detail records using normalized CRA status labels', async () => {
    mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
    mockPrisma.wklFileRecord.findMany.mockResolvedValue([
      {
        id: 5,
        recordIndex: 0,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          status: 'completed',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 1042 } },
      },
      {
        id: 6,
        recordIndex: 1,
        matchStatus: 'matched',
        matchedBy: 'SYSTEM',
        processedAt: null,
        recordData: {
          ...electronicRecordData,
          status: ';ABANDONED',
        },
        contact: null,
        batchDetail: { batch: { batchNumber: 1043 } },
      },
    ])

    const result = await service.findRecords(1, 1, 10, undefined, '[{"craStatus":"asc"}]')

    expect(result.data.map((record) => record.craStatus)).toEqual(['ABANDONED', 'COMPLETED'])
  })

  describe('associateRecord', () => {
    it('associates an unmatched electronic record with a contact', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
      mockPrisma.wklFileRecord.findFirst.mockResolvedValue({
        id: 5,
        matchStatus: WKL_MATCH_STATUS.UNMATCHED,
        contactId: null,
        processedAt: null,
        batchDetailId: null,
        recordData: electronicRecordData,
        contact: null,
        batchDetail: null,
      })
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 99 })
      mockPrisma.wklFileRecord.update.mockResolvedValue({
        id: 5,
        recordIndex: 0,
        matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
        matchedBy: null,
        processedAt: null,
        recordData: electronicRecordData,
        contact: { caseNumber: '1-99', personIdIcm: 'ICM-99' },
      })

      const result = await service.associateRecord(1, 5, 99)

      expect(mockPrisma.wklFileRecord.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
          contactId: 99,
          batchDetailId: null,
          matchedBy: null,
          processedAt: null,
        },
        include: wklRecordDtoInclude,
      })
      expect(result.matchStatus).toBe(WKL_MATCH_STATUS.ASSOCIATED)
      expect(result.associatedCaseNumber).toBe('1-99')
    })

    it('rejects association when CRA status is in-progress', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
      mockPrisma.wklFileRecord.findFirst.mockResolvedValue({
        id: 5,
        matchStatus: WKL_MATCH_STATUS.UNMATCHED,
        contactId: null,
        processedAt: null,
        batchDetailId: null,
        recordData: { ...electronicRecordData, status: 'in-progress' },
        contact: null,
        batchDetail: null,
      })

      await expect(service.associateRecord(1, 5, 99)).rejects.toThrow(
        'Only records with CRA status COMPLETED or ABANDONED can be associated',
      )
    })

    it('rejects association when record is not unmatched', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
      mockPrisma.wklFileRecord.findFirst.mockResolvedValue({
        id: 5,
        matchStatus: WKL_MATCH_STATUS.MATCHED,
        recordData: electronicRecordData,
        contact: null,
      })

      await expect(service.associateRecord(1, 5, 99)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects association for non-electronic records', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
      mockPrisma.wklFileRecord.findFirst.mockResolvedValue({
        id: 5,
        matchStatus: WKL_MATCH_STATUS.UNMATCHED,
        processedAt: null,
        batchDetailId: null,
        recordData: { ...electronicRecordData, receiveMode: ' ' },
        contact: null,
      })

      await expect(service.associateRecord(1, 5, 99)).rejects.toThrow(
        'Only electronic records can be associated',
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

      await expect(service.associateRecord(1, 5, 99)).rejects.toThrow(
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
        contactId: 99,
        processedAt: null,
        batchDetailId: null,
        recordData: electronicRecordData,
        contact: { caseNumber: '1-99', personIdIcm: 'ICM-99' },
        batchDetail: null,
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
        include: wklRecordDtoInclude,
      })
      expect(result.matchStatus).toBe(WKL_MATCH_STATUS.UNMATCHED)
    })

    it('rejects dissociate after record has been confirmed', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({ id: 1 })
      mockPrisma.wklFileRecord.findFirst.mockResolvedValue({
        id: 5,
        matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
        contactId: 99,
        processedAt: new Date('2025-04-21T12:00:00.000Z'),
        batchDetailId: 600,
        recordData: electronicRecordData,
        contact: { caseNumber: '1-99', personIdIcm: 'ICM-99' },
        batchDetail: { batch: { batchNumber: 1042 } },
      })

      await expect(service.dissociateRecord(1, 5)).rejects.toThrow(
        'Cannot dissociate a record that has already been confirmed',
      )
    })
  })

  describe('reprocess', () => {
    it('reprocesses associated records and returns processed ids', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({
        id: 1,
        deliveredAt: new Date('2025-04-21T10:00:00.000Z'),
      })
      mockPrisma.wklFileRecord.findMany.mockResolvedValue([
        {
          id: 5,
          recordIndex: 0,
          matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
          contactId: 99,
          processedAt: null,
          batchDetailId: null,
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
      expect(mockWklAssociatedRecordProcessor.processAssociatedRecord).toHaveBeenCalledWith(
        electronicRecordData,
        99,
        '1-99',
        expect.objectContaining({
          preferExistingInProgressDetail: true,
          batchDate: expect.any(Date),
          origin: 'WeeklyFilesService.reprocess',
        }),
        expect.any(Object),
      )
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
      mockPrisma.transferFile.findFirst.mockResolvedValue({
        id: 1,
        deliveredAt: new Date('2025-04-21T10:00:00.000Z'),
      })
      mockPrisma.wklFileRecord.findMany.mockResolvedValue([])

      await expect(service.reprocess(1, 'JDOE')).rejects.toThrow(
        'No associated records to reprocess',
      )
    })

    it('throws when all associated records fail reprocessing', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({
        id: 1,
        deliveredAt: new Date('2025-04-21T10:00:00.000Z'),
      })
      mockPrisma.wklFileRecord.findMany.mockResolvedValue([
        {
          id: 5,
          recordIndex: 0,
          matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
          contactId: 99,
          weeklyFileDate: new Date('2025-04-20'),
          processedAt: null,
          batchDetailId: null,
          recordData: electronicRecordData,
          contact: { id: 99, caseNumber: '1-99' },
        },
      ])
      mockWklAssociatedRecordProcessor.processAssociatedRecord.mockResolvedValue(null)

      await expect(service.reprocess(1, 'JDOE')).rejects.toThrow(
        'No associated records could be reprocessed',
      )
      expect(mockBatchesService.aggregateBatchStatus).not.toHaveBeenCalled()
      expect(mockIcmSyncBackService.syncFlaggedWithRetry).not.toHaveBeenCalled()
    })

    it('returns partial results when some associated records are skipped', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({
        id: 1,
        deliveredAt: new Date('2025-04-21T10:00:00.000Z'),
      })
      mockPrisma.wklFileRecord.findMany.mockResolvedValue([
        {
          id: 5,
          recordIndex: 0,
          matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
          contactId: 99,
          weeklyFileDate: new Date('2025-04-20'),
          processedAt: null,
          batchDetailId: null,
          recordData: electronicRecordData,
          contact: { id: 99, caseNumber: '1-99' },
        },
        {
          id: 6,
          recordIndex: 1,
          matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
          contactId: 100,
          weeklyFileDate: new Date('2025-04-20'),
          processedAt: null,
          batchDetailId: null,
          recordData: electronicRecordData,
          contact: { id: 100, caseNumber: '1-100' },
        },
      ])
      mockWklAssociatedRecordProcessor.processAssociatedRecord
        .mockImplementationOnce(async (_detail, _contactId, _caseNumber, ctx) => {
          ctx.processedBatchIds.add(500)
          return { contactId: 99, batchDetailId: 600 }
        })
        .mockResolvedValueOnce(null)
      mockPrisma.wklFileRecord.update.mockResolvedValue({})

      const result = await service.reprocess(1, 'JDOE')

      expect(result).toEqual({
        processedRecordIds: [5],
        skippedRecords: [{ recordId: 6, reason: 'processing_skipped' }],
      })
      expect(mockBatchesService.aggregateBatchStatus).toHaveBeenCalled()
      expect(mockIcmSyncBackService.syncFlaggedWithRetry).toHaveBeenCalled()
    })
  })

  describe('reprocessRecord', () => {
    it('reprocesses a single associated record and returns updated dto', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({
        id: 1,
        deliveredAt: new Date('2025-04-21T10:00:00.000Z'),
      })
      mockPrisma.wklFileRecord.findFirst
        .mockResolvedValueOnce({
          id: 5,
          matchStatus: WKL_MATCH_STATUS.ASSOCIATED,
          contactId: 99,
          processedAt: null,
          batchDetailId: null,
          weeklyFileDate: new Date('2025-04-20'),
          recordData: electronicRecordData,
          contact: { id: 99, caseNumber: '1-99', personIdIcm: 'ICM-99' },
        })
        .mockResolvedValueOnce({
          id: 5,
          matchStatus: WKL_MATCH_STATUS.MATCHED,
          contactId: 99,
          batchDetailId: 600,
          matchedBy: 'JDOE',
          processedAt: new Date('2025-04-21T12:00:00.000Z'),
          weeklyFileDate: new Date('2025-04-20'),
          recordData: electronicRecordData,
          contact: { id: 99, caseNumber: '1-99', personIdIcm: 'ICM-99' },
          batchDetail: { batch: { batchNumber: 1042 } },
        })
      mockWklAssociatedRecordProcessor.processAssociatedRecord.mockImplementation(
        async (_detail, _contactId, _caseNumber, ctx) => {
          ctx.processedBatchIds.add(500)
          return { contactId: 99, batchDetailId: 600 }
        },
      )
      mockPrisma.wklFileRecord.update.mockResolvedValue({})

      const result = await service.reprocessRecord(1, 5, 'JDOE')

      expect(mockWklAssociatedRecordProcessor.processAssociatedRecord).toHaveBeenCalledWith(
        electronicRecordData,
        99,
        '1-99',
        expect.objectContaining({
          preferExistingInProgressDetail: true,
          batchDate: expect.any(Date),
          origin: 'WeeklyFilesService.reprocessRecord',
        }),
        expect.any(Object),
      )
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
      expect(result.matchStatus).toBe(WKL_MATCH_STATUS.MATCHED)
    })

    it('rejects reprocess when record is not associated', async () => {
      mockPrisma.transferFile.findFirst.mockResolvedValue({
        id: 1,
        deliveredAt: new Date('2025-04-21T10:00:00.000Z'),
      })
      mockPrisma.wklFileRecord.findFirst.mockResolvedValue({
        id: 5,
        matchStatus: WKL_MATCH_STATUS.UNMATCHED,
        contactId: null,
        processedAt: null,
        batchDetailId: null,
        recordData: electronicRecordData,
        contact: null,
      })

      await expect(service.reprocessRecord(1, 5, 'JDOE')).rejects.toThrow(
        'Only associated records can be reprocessed',
      )
    })
  })
})
