import { PrismaService } from 'src/common/database/prisma.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CraMatchingSnapshot } from './cra-matching-snapshot.interface'
import { WeeklyContactMatcherService } from './weekly-contact-matcher.service'

const mockPrisma = {
  contactBatchDetail: { findMany: vi.fn() },
  contact: { findMany: vi.fn() },
}

const makeSnapshot = (overrides = {}): CraMatchingSnapshot => ({
  childGivenName: 'JOHN',
  childSurName: 'DOE',
  childSex: 'M',
  childBirthDate: '20100315',
  childBirthCity: 'VANCOUVER',
  childBirthProv: 'BC',
  childBirthCountry: 'CA',
  ccraDinNum: '123456789',
  ...overrides,
})

const makeBatchDetail = (overrides = {}) => ({
  id: 10,
  contactId: 1,
  batchId: 5,
  transactionType: 'application',
  systemComments: null,
  craMatchingSnapshot: makeSnapshot(),
  contact: { din: null },
  ...overrides,
})

const wklDetail = {
  childDin: '123456789',
  childGivenName: 'JOHN',
  childSurName: 'DOE',
  childSex: 'M',
  childBirthDate: '20100315',
  childBirthCity: 'VANCOUVER',
  childBirthProv: 'BC',
  childBirthCountry: 'CA',
}

describe('WeeklyContactMatcherService', () => {
  let service: WeeklyContactMatcherService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new WeeklyContactMatcherService(mockPrisma as unknown as PrismaService)
  })

  async function loadWith(details: any[]) {
    mockPrisma.contactBatchDetail.findMany.mockResolvedValue(details)
    await service.loadCandidates()
  }

  describe('loadCandidates', () => {
    it('should fetch in-progress batch details with snapshot', async () => {
      mockPrisma.contactBatchDetail.findMany.mockResolvedValue([])
      await service.loadCandidates()

      expect(mockPrisma.contactBatchDetail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            craMatchingSnapshot: expect.objectContaining({ not: expect.anything() }),
          }),
        }),
      )
    })
  })

  describe('findMatchingBatchDetail', () => {
    it('should match by DIN when snapshot has matching DIN', async () => {
      await loadWith([makeBatchDetail()])

      const result = await service.findMatchingBatchDetail(wklDetail)

      expect(result).toEqual({
        id: 10,
        contactId: 1,
        batchId: 5,
        transactionType: 'application',
        systemComments: null,
        contact: { din: null },
      })
    })

    it('should fall back to child details when DIN does not match', async () => {
      await loadWith([
        makeBatchDetail({ craMatchingSnapshot: makeSnapshot({ ccraDinNum: 'OTHER_DIN' }) }),
      ])

      const result = await service.findMatchingBatchDetail(wklDetail)

      expect(result).toEqual({
        id: 10,
        contactId: 1,
        batchId: 5,
        transactionType: 'application',
        systemComments: null,
        contact: { din: null },
      })
    })

    it('should match by child details when DIN is blank', async () => {
      await loadWith([makeBatchDetail()])

      const result = await service.findMatchingBatchDetail({ ...wklDetail, childDin: '   ' })

      expect(result).toEqual({
        id: 10,
        contactId: 1,
        batchId: 5,
        transactionType: 'application',
        systemComments: null,
        contact: { din: null },
      })
    })

    it('should return null when nothing matches', async () => {
      await loadWith([
        makeBatchDetail({
          craMatchingSnapshot: makeSnapshot({ ccraDinNum: 'OTHER', childGivenName: 'ALICE' }),
        }),
      ])

      const result = await service.findMatchingBatchDetail(wklDetail)

      expect(result).toBeNull()
    })

    it('should return null with warning when multiple child details match', async () => {
      await loadWith([
        makeBatchDetail({ id: 10, craMatchingSnapshot: makeSnapshot({ ccraDinNum: 'OTHER1' }) }),
        makeBatchDetail({
          id: 11,
          contactId: 2,
          craMatchingSnapshot: makeSnapshot({ ccraDinNum: 'OTHER2' }),
        }),
      ])

      const result = await service.findMatchingBatchDetail(wklDetail)

      expect(result).toBeNull()
    })

    it('should include contact.din in the result', async () => {
      await loadWith([makeBatchDetail({ contact: { din: 'EXISTING_DIN' } })])

      const result = await service.findMatchingBatchDetail(wklDetail)

      expect(result!.contact).toEqual({ din: 'EXISTING_DIN' })
    })

    it('should not query the database on each call', async () => {
      await loadWith([makeBatchDetail()])

      await service.findMatchingBatchDetail(wklDetail)
      await service.findMatchingBatchDetail(wklDetail)

      // findMany called once (in loadCandidates), not per findMatchingBatchDetail call
      expect(mockPrisma.contactBatchDetail.findMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('findMatchingContact', () => {
    it('should match contact by DIN', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 10, din: 'DIN123', csaStatus: 'batch_sent_application' },
      ])

      const result = await service.findMatchingContact({
        childDin: 'DIN123',
        childGivenName: 'JOHN',
        childSurName: 'DOE',
        childSex: 'M',
        childBirthDate: '20100101',
        childBirthCity: 'VICTORIA',
        childBirthProv: 'BC',
        childBirthCountry: 'CAN',
      })

      expect(result).toEqual({
        id: 10,
        din: 'DIN123',
        csaStatus: 'batch_sent_application',
      })
    })

    it('should fall back to child details when DIN has no match', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([])
      mockPrisma.contact.findMany.mockResolvedValueOnce([]) // DIN query
      mockPrisma.contact.findMany.mockResolvedValueOnce([
        { id: 20, din: null, csaStatus: 'eligible' },
      ]) // details query

      const result = await service.findMatchingContact({
        childDin: 'UNKNOWN',
        childGivenName: 'JANE',
        childSurName: 'SMITH',
        childSex: 'F',
        childBirthDate: '20120315',
        childBirthCity: 'VANCOUVER',
        childBirthProv: 'BC',
        childBirthCountry: 'CAN',
      })

      expect(result).toEqual({ id: 20, din: null, csaStatus: 'eligible' })
    })

    it('should return null when no contact matches', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([])

      const result = await service.findMatchingContact({
        childDin: '',
        childGivenName: 'NOBODY',
        childSurName: 'NOONE',
        childSex: 'M',
        childBirthDate: '20000101',
        childBirthCity: 'NOWHERE',
        childBirthProv: 'BC',
        childBirthCountry: 'CAN',
      })

      expect(result).toBeNull()
    })

    it('should return null when multiple contacts match by details', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([])
      mockPrisma.contact.findMany.mockResolvedValueOnce([]) // DIN
      mockPrisma.contact.findMany.mockResolvedValueOnce([
        { id: 30, din: null, csaStatus: 'eligible' },
        { id: 31, din: null, csaStatus: 'eligible_tbd' },
      ]) // details — ambiguous

      const result = await service.findMatchingContact({
        childDin: '',
        childGivenName: 'DUP',
        childSurName: 'NAME',
        childSex: 'F',
        childBirthDate: '20100101',
        childBirthCity: 'VICTORIA',
        childBirthProv: 'BC',
        childBirthCountry: 'CAN',
      })

      expect(result).toBeNull()
    })
  })
})
