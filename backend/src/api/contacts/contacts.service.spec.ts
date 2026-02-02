import { NotFoundException } from '@nestjs/common'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { PrismaService } from 'src/common/database/prisma.service'
import { ContactsService } from './contacts.service'

describe('ContactsService', () => {
  let service: ContactsService
  let prisma: PrismaService

  const savedContact1 = {
    id: 1,
    lastName: 'Doe',
    firstName: 'John',
    csaStatus: 'eligible',
    orderAmount: null,
  }
  const savedContact2 = {
    id: 2,
    lastName: 'Smith',
    firstName: 'Jane',
    csaStatus: 'in_pay',
    orderAmount: null,
  }

  const oneContact = {
    id: 1,
    lastName: 'Doe',
    firstName: 'John',
    csaStatus: 'eligible',
    orderAmount: null,
  }
  const updatedContact = {
    id: 1,
    lastName: 'Doe',
    firstName: 'John',
    csaStatus: 'in_pay',
    orderAmount: null,
  }
  const twoContact = {
    id: 2,
    lastName: 'Smith',
    firstName: 'Jane',
    csaStatus: 'in_pay',
    orderAmount: null,
  }

  const userArray = [oneContact, twoContact]
  const savedContactArray = [savedContact1, savedContact2]

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: PrismaService,
          useValue: {
            contact: {
              findMany: vi.fn().mockResolvedValue(savedContactArray as any),
              findUnique: vi.fn().mockResolvedValue(savedContact1 as any),
              create: vi.fn().mockResolvedValue(savedContact1 as any),
              update: vi.fn().mockResolvedValue(updatedContact as any),
              delete: vi.fn().mockResolvedValue(true),
              count: vi.fn(),
            },
            contactBatchDetail: {
              findMany: vi.fn().mockResolvedValue([]),
            },
            $queryRaw: vi.fn(),
            $transaction: vi.fn(),
          },
        },
      ],
    }).compile()

    service = module.get<ContactsService>(ContactsService)
    prisma = module.get<PrismaService>(PrismaService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('findAll', () => {
    it('should return paginated contacts with default parameters', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      const result = await service.findAll()
      expect(result).toEqual({
        data: userArray,
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      })
    })

    it('should use custom page and limit values', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(100)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([])

      const result = await service.findAll(3, 25)

      expect(result.page).toBe(3)
      expect(result.limit).toBe(25)
      expect(result.totalPages).toBe(4)
      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 50,
        take: 25,
        orderBy: undefined,
        where: {},
      })
    })

    it('should cap limit at 200', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(500)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([])

      const result = await service.findAll(1, 300)

      expect(result.limit).toBe(200)
      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 200,
        orderBy: undefined,
        where: {},
      })
    })

    it('should filter by a single column', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      const result = await service.findAll(
        1,
        10,
        '[{"lastName":"asc"}]',
        '[{"key":"lastName","op":"like","value":"Doe"}]',
      )

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [{ lastName: 'asc' }],
        where: { lastName: { contains: 'Doe', mode: 'insensitive' } },
      })
      expect(result.data).toEqual([savedContact1])
    })

    it('should sort descending', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(1, 10, '[{"firstName":"desc"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [{ firstName: 'desc' }],
        where: {},
      })
    })

    it('should handle filter without sort', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"din","op":"like","value":"ABC"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { din: { contains: 'ABC', mode: 'insensitive' } },
      })
    })

    it('should throw error on invalid sort field', async () => {
      await expect(service.findAll(1, 10, '[{"invalidField":"asc"}]')).rejects.toThrow(
        'Invalid sort field: invalidField',
      )
    })

    it('should throw error on invalid filter field', async () => {
      await expect(
        service.findAll(1, 10, undefined, '[{"key":"invalidField","op":"eq","value":"value"}]'),
      ).rejects.toThrow('Invalid filter field: invalidField')
    }) // New comprehensive tests for flexible filter/sort

    it('should throw BadRequestException on invalid sort JSON', async () => {
      await expect(service.findAll(1, 10, 'not-valid-json')).rejects.toThrow(
        'Invalid JSON format for sort parameter',
      )
    })

    it('should throw BadRequestException on invalid filter JSON', async () => {
      await expect(service.findAll(1, 10, undefined, 'not-valid-json')).rejects.toThrow(
        'Invalid JSON format for filter parameter',
      )
    })

    it('should handle multiple sort fields in correct order', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(1, 10, '[{"lastName":"desc"},{"firstName":"asc"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [{ lastName: 'desc' }, { firstName: 'asc' }],
        where: {},
      })
    })

    it('should handle multiple filters with AND logic', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(
        1,
        10,
        undefined,
        '[{"key":"lastName","op":"like","value":"Doe"},{"key":"age","op":"gte","value":18}]',
      )

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: {
          AND: [{ lastName: { contains: 'Doe', mode: 'insensitive' } }, { age: { gte: 18 } }],
        },
      })
    })

    it('should handle OR logic within filters', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(
        1,
        10,
        undefined,
        '[{"OR":[{"key":"csaStatus","op":"eq","value":"eligible"},{"key":"csaStatus","op":"eq","value":"in_pay"}]}]',
      )

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: {
          OR: [{ csaStatus: { equals: 'eligible' } }, { csaStatus: { equals: 'in_pay' } }],
        },
      })
    })

    it('should handle combined AND + OR logic', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(
        1,
        10,
        undefined,
        '[{"key":"lastName","op":"like","value":"Doe"},{"OR":[{"key":"csaStatus","op":"eq","value":"eligible"},{"key":"csaStatus","op":"eq","value":"in_pay"}]}]',
      )

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: {
          AND: [
            { lastName: { contains: 'Doe', mode: 'insensitive' } },
            { OR: [{ csaStatus: { equals: 'eligible' } }, { csaStatus: { equals: 'in_pay' } }] },
          ],
        },
      })
    }) // Filter operation tests

    it('should handle eq operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"csaStatus","op":"eq","value":"eligible"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { csaStatus: { equals: 'eligible' } },
      })
    })

    it('should handle neq operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"csaStatus","op":"neq","value":"deleted"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { csaStatus: { not: { equals: 'deleted' } } },
      })
    })

    it('should handle gt operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"age","op":"gt","value":18}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { age: { gt: 18 } },
      })
    })

    it('should handle gte operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"age","op":"gte","value":18}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { age: { gte: 18 } },
      })
    })

    it('should handle lt operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"age","op":"lt","value":65}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { age: { lt: 65 } },
      })
    })

    it('should handle lte operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"age","op":"lte","value":65}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { age: { lte: 65 } },
      })
    })

    it('should handle in operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(
        1,
        10,
        undefined,
        '[{"key":"csaStatus","op":"in","value":["eligible","in_pay"]}]',
      )

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { csaStatus: { in: ['eligible', 'in_pay'] } },
      })
    })

    it('should handle notin operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(
        1,
        10,
        undefined,
        '[{"key":"csaStatus","op":"notin","value":["deleted","archived"]}]',
      )

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { csaStatus: { not: { in: ['deleted', 'archived'] } } },
      })
    })

    it('should handle isnull operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"din","op":"isnull"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { din: null },
      })
    })

    it('should handle notnull operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"din","op":"notnull"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { din: { not: null } },
      })
    })

    it('should handle isblank operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"din","op":"isblank"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { OR: [{ din: null }, { din: '' }] },
      })
    })

    it('should handle notblank operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"din","op":"notblank"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { NOT: { OR: [{ din: null }, { din: '' }] } },
      })
    }) // Edge cases

    it('should handle empty filter array', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(1, 10, undefined, '[]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: {},
      })
    })

    it('should throw BadRequestException on empty OR array', async () => {
      await expect(service.findAll(1, 10, undefined, '[{"OR":[]}]')).rejects.toThrow(
        'OR condition must contain at least one filter item',
      )
    })

    it('should handle empty sort array', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(1, 10, '[]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: {},
      })
    })

    it('should throw error when filter contains invalid field even with valid ones', async () => {
      await expect(
        service.findAll(
          1,
          10,
          undefined,
          '[{"key":"invalidField","op":"eq","value":"test"},{"key":"lastName","op":"like","value":"Doe"}]',
        ),
      ).rejects.toThrow('Invalid filter field: invalidField')
    })
  })

  describe('findOne', () => {
    it('should get a single contact', async () => {
      await expect(service.findOne(1)).resolves.toEqual(oneContact)
    })
  })

  describe('fullTextSearch', () => {
    it('should search using searchText column', async () => {
      const mockData = [
        { id: 1, lastName: 'Smith', firstName: 'John' },
        { id: 2, lastName: 'Smith', firstName: 'Jane' },
      ]
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValueOnce(mockData as any)
      vi.spyOn(prisma.contact, 'count').mockResolvedValueOnce(2)

      const result = await service.fullTextSearch('smi', 1, 10)

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        where: { searchText: { contains: 'smi', mode: 'insensitive' } },
        skip: 0,
        take: 10,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
      expect(result).toEqual({
        data: mockData,
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      })
    })

    it('should return empty result for empty query', async () => {
      const result = await service.fullTextSearch('   ', 1, 10)

      expect(result).toEqual({
        data: [],
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      })
    })

    it('should handle empty search results', async () => {
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValueOnce([])
      vi.spyOn(prisma.contact, 'count').mockResolvedValueOnce(0)

      const result = await service.fullTextSearch('nonexistent', 1, 10)

      expect(result).toEqual({
        data: [],
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      })
    })

    it('should cap limit at 200', async () => {
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValueOnce([])
      vi.spyOn(prisma.contact, 'count').mockResolvedValueOnce(0)

      const result = await service.fullTextSearch('test', 1, 500)

      expect(result.limit).toBe(200)
    })

    it('should escape ILIKE special characters', async () => {
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValueOnce([])
      vi.spyOn(prisma.contact, 'count').mockResolvedValueOnce(0)

      await service.fullTextSearch('100%', 1, 10)

      // '%' should be escaped to '\%'
      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        where: { searchText: { contains: '100\\%', mode: 'insensitive' } },
        skip: 0,
        take: 10,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
    })

    it('should escape underscore character', async () => {
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValueOnce([])
      vi.spyOn(prisma.contact, 'count').mockResolvedValueOnce(0)

      await service.fullTextSearch('test_user', 1, 10)

      // '_' should be escaped to '\_'
      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        where: { searchText: { contains: 'test\\_user', mode: 'insensitive' } },
        skip: 0,
        take: 10,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
    })
  })

  describe('Validation errors (filter/sort)', () => {
    beforeEach(() => {
      vi.spyOn((prisma as any).contact, 'findMany').mockResolvedValue([])
      vi.spyOn((prisma as any).contact, 'count').mockResolvedValue(0)
    })

    it('should throw error for invalid filter field', async () => {
      await expect(
        service.findAll(1, 10, undefined, '[{"key":"invalidField","op":"eq","value":"test"}]'),
      ).rejects.toThrow('Invalid filter field: invalidField')
    })

    it('should throw error for invalid filter operation', async () => {
      await expect(
        service.findAll(1, 10, undefined, '[{"key":"lastName","op":"invalidOp","value":"test"}]'),
      ).rejects.toThrow('Invalid filter operation: invalidOp')
    })

    it('should throw error for invalid sort field', async () => {
      await expect(service.findAll(1, 10, '[{"invalidField":"asc"}]', undefined)).rejects.toThrow(
        'Invalid sort field: invalidField',
      )
    })

    it('should throw error for invalid sort direction', async () => {
      await expect(
        service.findAll(1, 10, '[{"lastName":"invalidDirection"}]', undefined),
      ).rejects.toThrow('Invalid sort direction: invalidDirection')
    })

    it('should throw error for malformed filter JSON', async () => {
      await expect(service.findAll(1, 10, undefined, '{invalid json}')).rejects.toThrow(
        'Invalid JSON format for filter parameter',
      )
    })

    it('should throw error for malformed sort JSON', async () => {
      await expect(service.findAll(1, 10, '{invalid json}', undefined)).rejects.toThrow(
        'Invalid JSON format for sort parameter',
      )
    })
  })

  describe('holdContacts (bulk)', () => {
    it('should put multiple contacts on hold', async () => {
      const contact1 = { id: 1, csaStatus: 'eligible', holdBy: null, resumeStatus: null }
      const contact2 = { id: 2, csaStatus: 'in_pay', holdBy: null, resumeStatus: null }

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([contact1, contact2] as any)
      vi.spyOn(prisma.contactBatchDetail, 'findMany').mockResolvedValue([])
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.holdContacts([1, 2], 'user1')

      expect(result.success).toEqual([1, 2])
      expect(result.skipped).toEqual([])
      expect(updateSpy).toHaveBeenCalledTimes(2)
    })

    it('should skip not found contacts', async () => {
      const contact1 = { id: 1, csaStatus: 'eligible', holdBy: null, resumeStatus: null }

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([contact1] as any)
      vi.spyOn(prisma.contactBatchDetail, 'findMany').mockResolvedValue([])
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.holdContacts([1, 999], 'user1')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([{ id: 999, reason: 'not_found' }])
    })

    it('should skip already on hold contacts', async () => {
      const contact1 = { id: 1, csaStatus: 'eligible', holdBy: null, resumeStatus: null }
      const contact2 = { id: 2, csaStatus: 'on_hold', holdBy: 'user1', resumeStatus: 'eligible' }

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([contact1, contact2] as any)
      vi.spyOn(prisma.contactBatchDetail, 'findMany').mockResolvedValue([])
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.holdContacts([1, 2], 'user1')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([{ id: 2, reason: 'already_on_hold' }])
    })

    it('should skip contacts in pending batch', async () => {
      const contact1 = { id: 1, csaStatus: 'eligible', holdBy: null, resumeStatus: null }
      const contact2 = { id: 2, csaStatus: 'eligible', holdBy: null, resumeStatus: null }

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([contact1, contact2] as any)
      vi.spyOn(prisma.contactBatchDetail, 'findMany').mockResolvedValue([{ contactId: 2 }] as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.holdContacts([1, 2], 'user1')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([{ id: 2, reason: 'in_pending_batch' }])
    })

    it('should handle mixed results', async () => {
      const contact1 = { id: 1, csaStatus: 'eligible', holdBy: null, resumeStatus: null }
      const contact2 = { id: 2, csaStatus: 'on_hold', holdBy: 'user1', resumeStatus: 'eligible' }
      const contact3 = { id: 3, csaStatus: 'in_pay', holdBy: null, resumeStatus: null }

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([contact1, contact2, contact3] as any)
      vi.spyOn(prisma.contactBatchDetail, 'findMany').mockResolvedValue([{ contactId: 3 }] as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.holdContacts([1, 2, 3, 999], 'user1')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([
        { id: 2, reason: 'already_on_hold' },
        { id: 3, reason: 'in_pending_batch' },
        { id: 999, reason: 'not_found' },
      ])
    })
  })

  describe('resumeContacts (bulk)', () => {
    it('should resume multiple contacts from hold', async () => {
      const contact1 = { id: 1, csaStatus: 'on_hold', holdBy: 'user1', resumeStatus: 'eligible' }
      const contact2 = { id: 2, csaStatus: 'on_hold', holdBy: 'user1', resumeStatus: 'in_pay' }

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([contact1, contact2] as any)
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.resumeContacts([1, 2], 'user1')

      expect(result.success).toEqual([1, 2])
      expect(result.skipped).toEqual([])
      expect(updateSpy).toHaveBeenCalledTimes(2)
    })

    it('should skip not found contacts', async () => {
      const contact1 = { id: 1, csaStatus: 'on_hold', holdBy: 'user1', resumeStatus: 'eligible' }

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([contact1] as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.resumeContacts([1, 999], 'user1')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([{ id: 999, reason: 'not_found' }])
    })

    it('should skip contacts not on hold', async () => {
      const contact1 = { id: 1, csaStatus: 'on_hold', holdBy: 'user1', resumeStatus: 'eligible' }
      const contact2 = { id: 2, csaStatus: 'eligible', holdBy: null, resumeStatus: null }

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([contact1, contact2] as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.resumeContacts([1, 2], 'user1')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([{ id: 2, reason: 'not_on_hold' }])
    })

    it('should handle mixed results', async () => {
      const contact1 = { id: 1, csaStatus: 'on_hold', holdBy: 'user1', resumeStatus: 'eligible' }
      const contact2 = { id: 2, csaStatus: 'eligible', holdBy: null, resumeStatus: null }

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([contact1, contact2] as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.resumeContacts([1, 2, 999], 'user1')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([
        { id: 2, reason: 'not_on_hold' },
        { id: 999, reason: 'not_found' },
      ])
    })
  })

  describe('findContactBatches', () => {
    it('should return batch details for a contact', async () => {
      const contact = { id: 1, firstName: 'John', lastName: 'Doe' }
      const batchDetails = [
        {
          id: 1,
          contactId: 1,
          batchId: 5,
          transactionType: 'application',
          status: 'processed',
          batch: { id: 5, batchDate: new Date('2026-01-15'), status: 'processed' },
        },
      ]

      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      vi.spyOn(prisma.contactBatchDetail, 'findMany').mockResolvedValue(batchDetails as any)

      const result = await service.findContactBatches(1)

      expect(result).toEqual(batchDetails)
      expect(prisma.contactBatchDetail.findMany).toHaveBeenCalledWith({
        where: { contactId: 1 },
        include: {
          batch: {
            select: { id: true, batchDate: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    })

    it('should throw NotFoundException if contact not found', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(null)

      await expect(service.findContactBatches(999)).rejects.toThrow(NotFoundException)
      await expect(service.findContactBatches(999)).rejects.toThrow('Contact 999 not found')
    })
  })
})
