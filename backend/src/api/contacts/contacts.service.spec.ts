import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service'
import { ContactsService } from './contacts.service'

// Using Vitest (vi) – make sure you run tests with Vitest and have its globals configured

describe('ContactsService', () => {
  let service: ContactsService
  let prisma: PrismaService // --- camelCase fixtures to match Prisma + DTO ---

  const savedContact1 = {
    id: 1,
    lastName: 'Doe',
    givenNames: 'John',
    csaStatus: 'eligible',
  }
  const savedContact2 = {
    id: 2,
    lastName: 'Smith',
    givenNames: 'Jane',
    csaStatus: 'in_pay',
  }

  const oneContact = {
    id: 1,
    lastName: 'Doe',
    givenNames: 'John',
    csaStatus: 'eligible',
  }
  const updatedContact = {
    id: 1,
    lastName: 'Doe',
    givenNames: 'John',
    csaStatus: 'in_pay',
  }
  const twoContact = {
    id: 2,
    lastName: 'Smith',
    givenNames: 'Jane',
    csaStatus: 'in_pay',
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
            // IMPORTANT: singular "contact" to match prisma.contact
            contact: {
              findMany: vi.fn().mockResolvedValue(savedContactArray),
              findUnique: vi.fn().mockResolvedValue(savedContact1),
              create: vi.fn().mockResolvedValue(savedContact1),
              update: vi.fn().mockResolvedValue(updatedContact),
              delete: vi.fn().mockResolvedValue(true),
              count: vi.fn(),
            },
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
      })
    })
  })

  describe('findOne', () => {
    it('should get a single contact', async () => {
      await expect(service.findOne(1)).resolves.toEqual(oneContact)
    })
  })

  describe('searchContacts', () => {
    it('should return a list of contacts with pagination and filtering', async () => {
      const page = 1
      const limit = 10
      const sortObject: Prisma.SortOrder = 'asc'
      const sort: any = `[{ "name": "${sortObject}" }]`
      const filter: any = '[{ "name": { "equals": "Peter" } }]'

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([])
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(0)

      const result = await service.searchContacts(page, limit, sort, filter)

      expect(result).toEqual({
        contacts: [],
        page,
        limit,
        total: 0,
        totalPages: 0,
      })
    })

    it('given no page should default to page 1', async () => {
      const limit = 10
      const sortObject: Prisma.SortOrder = 'asc'
      const sort: any = `[{ "name": "${sortObject}" }]`
      const filter: any = '[{ "name": { "equals": "Peter" } }]'

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([])
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(0)
      const result = await service.searchContacts(null as any, limit, sort, filter)

      expect(result).toEqual({
        contacts: [],
        page: 1,
        limit,
        total: 0,
        totalPages: 0,
      })
    })

    it('given no limit should default to limit 10', async () => {
      const page = 1
      const sortObject: Prisma.SortOrder = 'asc'
      const sort: any = `[{ "name": "${sortObject}" }]`
      const filter: any = '[{ "name": { "equals": "Peter" } }]'

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([])
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(0)
      const result = await service.searchContacts(page, null as any, sort, filter)

      expect(result).toEqual({
        contacts: [],
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      })
    })

    it('given limit > 200 should default to limit 10', async () => {
      const page = 1
      const limit = 201
      const sortObject: Prisma.SortOrder = 'asc'
      const sort: any = `[{ "name": "${sortObject}" }]`
      const filter: any = '[{ "name": { "equals": "Peter" } }]'

      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([])
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(0)
      const result = await service.searchContacts(page, limit, sort, filter)

      expect(result).toEqual({
        contacts: [],
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      })
    })

    it('given invalid JSON should throw error', async () => {
      const page = 1
      const limit = 201
      const sortObject: Prisma.SortOrder = 'asc'
      const sort: any = `[{ "name" "${sortObject}" }]` // malformed
      const filter: any = '[{ "name": { "equals": "Peter" } }]'

      await expect(service.searchContacts(page, limit, sort, filter)).rejects.toEqual(
        new Error('Invalid query parameters'),
      )
    })
  })

  describe('convertFiltersToPrismaFormat', () => {
    it("should convert input filters to prisma's filter format", () => {
      const inputFilter = [
        { key: 'a', operation: 'like', value: '1' },
        { key: 'b', operation: 'eq', value: '2' },
        { key: 'c', operation: 'neq', value: '3' },
        { key: 'd', operation: 'gt', value: '4' },
        { key: 'e', operation: 'gte', value: '5' },
        { key: 'f', operation: 'lt', value: '6' },
        { key: 'g', operation: 'lte', value: '7' },
        { key: 'h', operation: 'in', value: ['8'] },
        { key: 'i', operation: 'notin', value: ['9'] },
        { key: 'j', operation: 'isnull', value: '10' },
      ]

      const expectedOutput = {
        a: { contains: '1' },
        b: { equals: '2' },
        c: { not: { equals: '3' } },
        d: { gt: '4' },
        e: { gte: '5' },
        f: { lt: '6' },
        g: { lte: '7' },
        h: { in: ['8'] },
        i: { not: { in: ['9'] } },
        j: { equals: null },
      }

      expect(service.convertFiltersToPrismaFormat(inputFilter)).toStrictEqual(expectedOutput)
    })
  })
})
