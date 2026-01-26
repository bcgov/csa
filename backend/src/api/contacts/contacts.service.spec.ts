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
    givenNames: 'John',
    csaStatus: 'eligible',
    orderAmount: null,
  }
  const savedContact2 = {
    id: 2,
    lastName: 'Smith',
    givenNames: 'Jane',
    csaStatus: 'in_pay',
    orderAmount: null,
  }

  const oneContact = {
    id: 1,
    lastName: 'Doe',
    givenNames: 'John',
    csaStatus: 'eligible',
    orderAmount: null,
  }
  const twoContact = {
    id: 2,
    lastName: 'Smith',
    givenNames: 'Jane',
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
              findMany: vi.fn().mockResolvedValue(savedContactArray),
              findUnique: vi.fn().mockResolvedValue(savedContact1),
              count: vi.fn(),
            },
            $queryRaw: vi.fn(),
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

      await service.findAll(1, 10, '[{"givenNames":"desc"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [{ givenNames: 'desc' }],
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

    it('should ignore invalid sort field', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(1, 10, '[{"invalidField":"asc"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: {},
      })
    })

    it('should ignore invalid filter field', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(1, 10, undefined, '[{"key":"invalidField","op":"eq","value":"value"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: {},
      })
    })

    // JSON parsing tests
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

    // Multi-field tests
    it('should handle multiple sort fields in correct order', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(1, 10, '[{"lastName":"desc"},{"givenNames":"asc"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [{ lastName: 'desc' }, { givenNames: 'asc' }],
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
    })

    // Filter operation tests
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
    })

    // Edge cases
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

    it('should filter out invalid fields silently', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(
        1,
        10,
        undefined,
        '[{"key":"invalidField","op":"eq","value":"test"},{"key":"lastName","op":"like","value":"Doe"}]',
      )

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: undefined,
        where: { lastName: { contains: 'Doe', mode: 'insensitive' } },
      })
    })
  })

  describe('findOne', () => {
    it('should get a single contact', async () => {
      await expect(service.findOne(1)).resolves.toEqual(oneContact)
    })
  })

  describe('fullTextSearch', () => {
    it('should return paginated results for a search query', async () => {
      const mockResults = [
        { id: 1, lastName: 'Doe', givenNames: 'John' },
        { id: 2, lastName: 'Doe', givenNames: 'Jane' },
      ]
      vi.spyOn(prisma, '$queryRaw')
        .mockResolvedValueOnce(mockResults)
        .mockResolvedValueOnce([{ count: BigInt(2) }])

      const result = await service.fullTextSearch('doe', 1, 10)

      expect(result).toEqual({
        data: mockResults,
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      })
    })

    it('should handle empty search results', async () => {
      vi.spyOn(prisma, '$queryRaw')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }])

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
      vi.spyOn(prisma, '$queryRaw')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }])

      const result = await service.fullTextSearch('test', 1, 500)

      expect(result.limit).toBe(200)
    })

    it('should handle multi-word search queries', async () => {
      vi.spyOn(prisma, '$queryRaw')
        .mockResolvedValueOnce([{ id: 1, lastName: 'Doe', givenNames: 'John' }])
        .mockResolvedValueOnce([{ count: BigInt(1) }])

      const result = await service.fullTextSearch('john doe', 1, 10)

      expect(result.data).toHaveLength(1)
      expect(prisma.$queryRaw).toHaveBeenCalled()
    })
  })
})
