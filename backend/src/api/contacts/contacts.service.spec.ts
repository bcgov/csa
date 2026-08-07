import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { USER_PROFILE } from 'src/api/admin/constants/user-profile.constants'
import { PrismaService } from 'src/common/database/prisma.service'
import { StateMachineService } from 'src/common/state-machine/state-machine.service'
import { EligibilityInputError } from 'src/sync/eligibility/eligibility.errors'
import { EligibilityService } from 'src/sync/eligibility/eligibility.service'
import { IcmSyncBackService } from 'src/sync/icm/icm-sync-back.service'
import { ContactsService } from './contacts.service'
import { CONTACT_DELETE_APPLICATION_TABLES, CONTACT_DELETE_STAGING_TABLES } from './constants'

describe('ContactsService', () => {
  let service: ContactsService
  let prisma: PrismaService

  // Raw DB records (what Prisma returns)
  const savedContact1: any = {
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

  const savedContactArray: any[] = [savedContact1, savedContact2]

  // Enriched records (what the service returns — includes csaStatusLabel)
  const enrichedContact1 = { ...savedContact1, csaStatusLabel: 'Eligible' }
  const enrichedOneContact = { ...oneContact, csaStatusLabel: 'Eligible' }
  const enrichedTwoContact = { ...twoContact, csaStatusLabel: 'In Pay' }
  const enrichedUserArray = [enrichedOneContact, enrichedTwoContact]

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        StateMachineService,
        {
          provide: IcmSyncBackService,
          useValue: {
            syncSingleContact: vi.fn().mockResolvedValue(true),
          },
        },
        {
          provide: EligibilityService,
          useValue: {
            runForContact: vi.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            contact: {
              findMany: vi.fn().mockResolvedValue(savedContactArray as any),
              findUnique: vi.fn().mockResolvedValue(savedContact1 as any),
              findFirst: vi.fn().mockResolvedValue(null),
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
            $executeRaw: vi.fn(),
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
        data: enrichedUserArray,
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ lastName: 'asc' }, { id: 'asc' }],
        where: { lastName: { contains: 'Doe', mode: 'insensitive' } },
      })
      expect(result.data).toEqual([enrichedContact1])
    })

    it('should sort descending', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(1, 10, '[{"firstName":"desc"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [{ firstName: 'desc' }, { id: 'asc' }],
        where: {},
      })
    })

    it('should use stable default order when no sort is provided', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll()

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ id: 'asc' }],
        }),
      )
    })

    it('should append id tie-breaker for user-selected sorts', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(1, 10, '[{"lastName":"asc"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ lastName: 'asc' }, { id: 'asc' }],
        }),
      )
    })

    it('should not duplicate id when sort already includes id', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(1, 10, '[{"id":"desc"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ id: 'desc' }],
        }),
      )
    })

    it('should handle filter without sort', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"din","op":"like","value":"ABC"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [{ id: 'asc' }],
        where: { din: { contains: 'ABC', mode: 'insensitive' } },
      })
    })

    it('should escape ILIKE special characters in filter like', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(0)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([])

      await service.findAll(1, 10, undefined, '[{"key":"din","op":"like","value":"100%"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [{ id: 'asc' }],
        where: { din: { contains: '100\\%', mode: 'insensitive' } },
      })
    })

    it('should allow filtering on searchText and extended person/birth fields', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(
        1,
        10,
        undefined,
        '[{"OR":[{"key":"searchText","op":"like","value":"smith"},{"key":"personIdIcm","op":"like","value":"ICM123"}]}]',
      )

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [{ id: 'asc' }],
        where: {
          OR: [
            { searchText: { contains: 'smith', mode: 'insensitive' } },
            { personIdIcm: { contains: 'ICM123', mode: 'insensitive' } },
          ],
        },
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
    })

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
        orderBy: [{ lastName: 'desc' }, { firstName: 'asc' }, { id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
        where: {
          AND: [
            { lastName: { contains: 'Doe', mode: 'insensitive' } },
            { OR: [{ csaStatus: { equals: 'eligible' } }, { csaStatus: { equals: 'in_pay' } }] },
          ],
        },
      })
    })

    it('should handle eq operation', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(1)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue([savedContact1])

      await service.findAll(1, 10, undefined, '[{"key":"csaStatus","op":"eq","value":"eligible"}]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
        where: { NOT: { OR: [{ din: null }, { din: '' }] } },
      })
    })

    it('should handle empty filter array', async () => {
      vi.spyOn(prisma.contact, 'count').mockResolvedValue(2)
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValue(savedContactArray)

      await service.findAll(1, 10, undefined, '[]')

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: [{ id: 'asc' }],
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
        orderBy: [{ id: 'asc' }],
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
      await expect(service.findOne(1)).resolves.toEqual(enrichedContact1)
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
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
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

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        where: { searchText: { contains: '100\\%', mode: 'insensitive' } },
        skip: 0,
        take: 10,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      })
    })

    it('should escape underscore character', async () => {
      vi.spyOn(prisma.contact, 'findMany').mockResolvedValueOnce([])
      vi.spyOn(prisma.contact, 'count').mockResolvedValueOnce(0)

      await service.fullTextSearch('test_user', 1, 10)

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        where: { searchText: { contains: 'test\\_user', mode: 'insensitive' } },
        skip: 0,
        take: 10,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
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
      const contact1 = { id: 1, csaStatus: 'eligible_tbd', holdBy: null, resumeStatus: null }
      const contact2 = {
        id: 2,
        csaStatus: 'application_refused_cra',
        holdBy: null,
        resumeStatus: null,
      }
      const contactMap = new Map([
        [1, contact1],
        [2, contact2],
      ])

      ;(vi.spyOn(prisma.contact, 'findUnique') as any).mockImplementation(({ where }: any) =>
        Promise.resolve(contactMap.get(where.id) as any),
      )
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.holdContacts([1, 2], 'user1', 'Test reason')

      expect(result.success).toEqual([1, 2])
      expect(result.skipped).toEqual([])
      expect(updateSpy).toHaveBeenCalledTimes(2)
    })

    it('should skip not found contacts', async () => {
      const contact1 = { id: 1, csaStatus: 'eligible_tbd', holdBy: null, resumeStatus: null }
      const contactMap = new Map([[1, contact1]])

      ;(vi.spyOn(prisma.contact, 'findUnique') as any).mockImplementation(({ where }: any) =>
        Promise.resolve(contactMap.get(where.id) as any),
      )
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.holdContacts([1, 999], 'user1', 'Test reason')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([{ id: 999, reason: 'not_found' }])
    })

    it('should skip contacts with invalid transition', async () => {
      const contact1 = { id: 1, csaStatus: 'eligible_tbd', holdBy: null, resumeStatus: null }
      const contact2 = { id: 2, csaStatus: 'on_hold', holdBy: 'user1', resumeStatus: 'eligible' }
      const contactMap = new Map([
        [1, contact1],
        [2, contact2],
      ])

      ;(vi.spyOn(prisma.contact, 'findUnique') as any).mockImplementation(({ where }: any) =>
        Promise.resolve(contactMap.get(where.id) as any),
      )
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.holdContacts([1, 2], 'user1', 'Test reason')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([{ id: 2, reason: 'invalid_transition' }])
    })

    it('should handle mixed results', async () => {
      const contact1 = { id: 1, csaStatus: 'eligible_tbd', holdBy: null, resumeStatus: null }
      const contact2 = { id: 2, csaStatus: 'on_hold', holdBy: 'user1', resumeStatus: 'eligible' }
      const contact3 = { id: 3, csaStatus: 'in_pay', holdBy: null, resumeStatus: null }
      const contactMap = new Map([
        [1, contact1],
        [2, contact2],
        [3, contact3],
      ])

      ;(vi.spyOn(prisma.contact, 'findUnique') as any).mockImplementation(({ where }: any) =>
        Promise.resolve(contactMap.get(where.id) as any),
      )
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.holdContacts([1, 2, 3, 999], 'user1', 'Test reason')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([
        { id: 2, reason: 'invalid_transition' },
        { id: 3, reason: 'invalid_transition' },
        { id: 999, reason: 'not_found' },
      ])
    })
  })

  describe('resumeContacts (bulk)', () => {
    it('should resume multiple contacts from hold', async () => {
      const contact1 = {
        id: 1,
        csaStatus: 'on_hold',
        holdBy: 'user1',
        resumeStatus: 'eligible_tbd',
      }
      const contact2 = {
        id: 2,
        csaStatus: 'on_hold',
        holdBy: 'user1',
        resumeStatus: 'application_refused_cra',
      }
      const contactMap = new Map([
        [1, contact1],
        [2, contact2],
      ])

      ;(vi.spyOn(prisma.contact, 'findUnique') as any).mockImplementation(({ where }: any) =>
        Promise.resolve(contactMap.get(where.id) as any),
      )
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.resumeContacts([1, 2], 'user1')

      expect(result.success).toEqual([1, 2])
      expect(result.skipped).toEqual([])
      // 2 calls per contact: 1 for status transition + 1 for clearing needsReview flag
      expect(updateSpy).toHaveBeenCalledTimes(4)
    })

    it('should skip not found contacts', async () => {
      const contact1 = {
        id: 1,
        csaStatus: 'on_hold',
        holdBy: 'user1',
        resumeStatus: 'eligible_tbd',
      }
      const contactMap = new Map([[1, contact1]])

      ;(vi.spyOn(prisma.contact, 'findUnique') as any).mockImplementation(({ where }: any) =>
        Promise.resolve(contactMap.get(where.id) as any),
      )
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.resumeContacts([1, 999], 'user1')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([{ id: 999, reason: 'not_found' }])
    })

    it('should skip contacts not on hold', async () => {
      const contact1 = {
        id: 1,
        csaStatus: 'on_hold',
        holdBy: 'user1',
        resumeStatus: 'eligible_tbd',
      }
      const contact2 = { id: 2, csaStatus: 'eligible', holdBy: null, resumeStatus: null }
      const contactMap = new Map([
        [1, contact1],
        [2, contact2],
      ])

      ;(vi.spyOn(prisma.contact, 'findUnique') as any).mockImplementation(({ where }: any) =>
        Promise.resolve(contactMap.get(where.id) as any),
      )
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.resumeContacts([1, 2], 'user1')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([{ id: 2, reason: 'invalid_transition' }])
    })

    it('should handle mixed results', async () => {
      const contact1 = {
        id: 1,
        csaStatus: 'on_hold',
        holdBy: 'user1',
        resumeStatus: 'eligible_tbd',
      }
      const contact2 = { id: 2, csaStatus: 'eligible', holdBy: null, resumeStatus: null }
      const contactMap = new Map([
        [1, contact1],
        [2, contact2],
      ])

      ;(vi.spyOn(prisma.contact, 'findUnique') as any).mockImplementation(({ where }: any) =>
        Promise.resolve(contactMap.get(where.id) as any),
      )
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.resumeContacts([1, 2, 999], 'user1')

      expect(result.success).toEqual([1])
      expect(result.skipped).toEqual([
        { id: 2, reason: 'invalid_transition' },
        { id: 999, reason: 'not_found' },
      ])
    })
  })

  describe('button bulk status handlers', () => {
    it('should treat application/cancellation refused as eligible targets for ELIGIBLE action', async () => {
      const contactMap = new Map([
        [1, { id: 1, csaStatus: 'application_refused_cra' }],
        [2, { id: 2, csaStatus: 'cancellation_refused_cra' }],
      ])

      ;(vi.spyOn(prisma.contact, 'findUnique') as any).mockImplementation(({ where }: any) =>
        Promise.resolve(contactMap.get(where.id) as any),
      )
      const updateSpy = vi
        .spyOn(service, 'updateCsaStatus')
        .mockResolvedValue({ success: true, from: 'x', to: 'y' } as any)

      const result = await service.updateEligibilityStatus([1, 2], 'ELIGIBLE', 'user1')

      expect(result.success).toEqual([1, 2])
      expect(result.skipped).toEqual([])
      expect(updateSpy).toHaveBeenCalledWith(
        1,
        'BECOME_ELIGIBLE',
        'USER',
        expect.objectContaining({ userId: 'user1' }),
      )
      expect(updateSpy).toHaveBeenCalledWith(
        2,
        'BECOME_ELIGIBLE',
        'USER',
        expect.objectContaining({ userId: 'user1' }),
      )
    })

    it('should treat application/cancellation refused as valid sources for SET_NOT_ELIGIBLE action', async () => {
      const contactMap = new Map([
        [1, { id: 1, csaStatus: 'application_refused_cra' }],
        [2, { id: 2, csaStatus: 'cancellation_refused_cra' }],
      ])

      ;(vi.spyOn(prisma.contact, 'findUnique') as any).mockImplementation(({ where }: any) =>
        Promise.resolve(contactMap.get(where.id) as any),
      )
      const updateSpy = vi
        .spyOn(service, 'updateCsaStatus')
        .mockResolvedValue({ success: true, from: 'x', to: 'y' } as any)

      const result = await service.updateNotEligibleStatus([1, 2], 'SET_NOT_ELIGIBLE', 'user1')

      expect(result.success).toEqual([1, 2])
      expect(result.skipped).toEqual([])
      expect(updateSpy).toHaveBeenCalledWith(
        1,
        'SET_NOT_ELIGIBLE',
        'USER',
        expect.objectContaining({ userId: 'user1' }),
      )
      expect(updateSpy).toHaveBeenCalledWith(
        2,
        'SET_NOT_ELIGIBLE',
        'USER',
        expect.objectContaining({ userId: 'user1' }),
      )
    })
  })

  describe('updateCsaStatus', () => {
    it('should transition contact with static target', async () => {
      const contact = { id: 1, csaStatus: 'eligible', resumeStatus: null }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.updateCsaStatus(1, 'ADD_TO_BATCH', 'USER', { userId: 'user1' })

      expect(result.success).toBe(true)
      expect(result.to).toBe('in_batch_application')
    })

    it('should handle RESUME with valid resumeStatus', async () => {
      const contact = { id: 1, csaStatus: 'on_hold', resumeStatus: 'eligible_tbd' }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.updateCsaStatus(1, 'RESUME', 'USER', { userId: 'user1' })

      expect(result.success).toBe(true)
      expect(result.to).toBe('eligible_tbd')
    })

    it('should handle HOLD and save resumeStatus', async () => {
      const contact = { id: 1, csaStatus: 'eligible_tbd', resumeStatus: null }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.updateCsaStatus(1, 'HOLD', 'USER', { userId: 'user1' })

      expect(result.success).toBe(true)
      expect(result.to).toBe('on_hold')
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            csaStatus: 'on_hold',
            resumeStatus: 'eligible_tbd',
            holdBy: 'user1',
          }),
        }),
      )
    })

    it('should return error for non-existent contact', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(null)

      const result = await service.updateCsaStatus(999, 'ADD_TO_BATCH', 'USER')

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Contact not found')
    })

    describe('preBatchStatus lifecycle', () => {
      it('should set preBatchStatus on ADD_TO_BATCH when null', async () => {
        const contact = { id: 1, csaStatus: 'eligible', preBatchStatus: null, resumeStatus: null }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'ADD_TO_BATCH', 'USER', { userId: 'user1' })

        expect(result.success).toBe(true)
        expect(result.to).toBe('in_batch_application')
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              preBatchStatus: 'eligible',
            }),
          }),
        )
      })

      it('should overwrite preBatchStatus on ADD_TO_BATCH (fresh each cycle)', async () => {
        const contact = {
          id: 1,
          csaStatus: 'application_refused_cra',
          preBatchStatus: 'eligible',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'ADD_TO_BATCH', 'USER', { userId: 'user1' })

        expect(result.success).toBe(true)
        expect(result.to).toBe('in_batch_application')
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              preBatchStatus: 'application_refused_cra',
            }),
          }),
        )
      })

      it('should clear preBatchStatus on CRA_RSP_REJECTED', async () => {
        const contact = {
          id: 1,
          csaStatus: 'batch_sent_application',
          preBatchStatus: 'eligible',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'CRA_RSP_REJECTED', 'SYSTEM')

        expect(result.success).toBe(true)
        expect(result.to).toBe('cra_error_application')
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              preBatchStatus: null,
            }),
          }),
        )
      })

      it('should resolve CRA_FILE_REJECTED from preBatchStatus and clear it', async () => {
        const contact = {
          id: 1,
          csaStatus: 'batch_sent_application',
          preBatchStatus: 'eligible',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'CRA_FILE_REJECTED', 'SYSTEM')

        expect(result.success).toBe(true)
        expect(result.to).toBe('eligible')
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              csaStatus: 'eligible',
              preBatchStatus: null,
            }),
          }),
        )
      })

      it('should map refused preBatchStatus to TBD on CRA_FILE_REJECTED', async () => {
        const contact = {
          id: 1,
          csaStatus: 'batch_sent_application',
          preBatchStatus: 'application_refused_cra',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'CRA_FILE_REJECTED', 'SYSTEM')

        expect(result.success).toBe(true)
        expect(result.to).toBe('eligible_tbd')
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              csaStatus: 'eligible_tbd',
              preBatchStatus: null,
            }),
          }),
        )
      })

      it('should map refused preBatchStatus to TBD on CRA_FILE_REJECTED (cancellation flow)', async () => {
        const contact = {
          id: 1,
          csaStatus: 'batch_sent_cancellation',
          preBatchStatus: 'cancellation_refused_cra',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'CRA_FILE_REJECTED', 'SYSTEM')

        expect(result.success).toBe(true)
        expect(result.to).toBe('not_eligible_ip_tbd')
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              csaStatus: 'not_eligible_ip_tbd',
              preBatchStatus: null,
            }),
          }),
        )
      })

      it('should fail CRA_FILE_REJECTED when preBatchStatus is null', async () => {
        const contact = {
          id: 1,
          csaStatus: 'batch_sent_application',
          preBatchStatus: null,
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)

        const result = await service.updateCsaStatus(1, 'CRA_FILE_REJECTED', 'SYSTEM')

        expect(result.success).toBe(false)
      })

      it('should resolve REMOVE_FROM_BATCH target from preBatchStatus mapping', async () => {
        const contact = {
          id: 1,
          csaStatus: 'in_batch_application',
          preBatchStatus: 'eligible',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'REMOVE_FROM_BATCH', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(true)
        expect(result.to).toBe('eligible_tbd')
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              csaStatus: 'eligible_tbd',
            }),
          }),
        )
      })

      it('should resolve REMOVE_FROM_BATCH to application_refused_cra when preBatchStatus is application_refused_cra', async () => {
        const contact = {
          id: 1,
          csaStatus: 'in_batch_application',
          preBatchStatus: 'application_refused_cra',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'REMOVE_FROM_BATCH', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(true)
        expect(result.to).toBe('application_refused_cra')
      })

      it('should resolve REMOVE_FROM_BATCH for cancellation flow', async () => {
        const contact = {
          id: 1,
          csaStatus: 'in_batch_cancellation',
          preBatchStatus: 'not_eligible_in_pay',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'REMOVE_FROM_BATCH', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(true)
        expect(result.to).toBe('not_eligible_ip_tbd')
      })

      it('should clear preBatchStatus on REMOVE_FROM_BATCH', async () => {
        const contact = {
          id: 1,
          csaStatus: 'in_batch_application',
          preBatchStatus: 'eligible',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'REMOVE_FROM_BATCH', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(true)
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              preBatchStatus: null,
            }),
          }),
        )
      })

      it('should fail REMOVE_FROM_BATCH when preBatchStatus is null', async () => {
        const contact = {
          id: 1,
          csaStatus: 'in_batch_application',
          preBatchStatus: null,
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)

        const result = await service.updateCsaStatus(1, 'REMOVE_FROM_BATCH', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(false)
      })

      it('should clear preBatchStatus on CRA_RSP_REJECTED from cancellation', async () => {
        const contact = {
          id: 1,
          csaStatus: 'batch_sent_cancellation',
          preBatchStatus: 'not_eligible_in_pay',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'CRA_RSP_REJECTED', 'SYSTEM')

        expect(result.success).toBe(true)
        expect(result.to).toBe('cra_error_cancellation')
        expect(updateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              preBatchStatus: null,
            }),
          }),
        )
      })
    })

    describe('cancellation fields on SET_NOT_ELIGIBLE', () => {
      it('should set cancelReasonCode and careEndDate from in_pay', async () => {
        const contact = {
          id: 1,
          csaStatus: 'in_pay',
          cancelReasonCode: null,
          personIdIcm: 'ICM-1',
          personIdMis: 'MIS-1',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        vi.spyOn(prisma, '$queryRaw').mockResolvedValue([
          { maxEndDate: new Date('2025-07-01') },
        ] as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'SET_NOT_ELIGIBLE', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(true)
        expect(result.to).toBe('not_eligible_ip_tbd')
        const updateCall = updateSpy.mock.calls[0][0] as any
        expect(updateCall.data.cancelReasonCode).toBe('21')
        expect(updateCall.data.careEndDate).toEqual(new Date('2025-07-01'))
      })

      it('should NOT set cancellation fields from eligible_tbd', async () => {
        const contact = {
          id: 1,
          csaStatus: 'eligible_tbd',
          cancelReasonCode: null,
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'SET_NOT_ELIGIBLE', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(true)
        expect(result.to).toBe('not_eligible_out_of_pay')
        const updateCall = updateSpy.mock.calls[0][0] as any
        expect(updateCall.data).not.toHaveProperty('cancelReasonCode')
        expect(updateCall.data).not.toHaveProperty('careEndDate')
      })

      it('should NOT set cancellation fields from on_hold', async () => {
        const contact = {
          id: 1,
          csaStatus: 'on_hold',
          cancelReasonCode: null,
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'SET_NOT_ELIGIBLE', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(true)
        expect(result.to).toBe('not_eligible_out_of_pay')
        const updateCall = updateSpy.mock.calls[0][0] as any
        expect(updateCall.data).not.toHaveProperty('cancelReasonCode')
        expect(updateCall.data).not.toHaveProperty('careEndDate')
      })

      it('should NOT overwrite cancelReasonCode when already set but still set careEndDate', async () => {
        const contact = {
          id: 1,
          csaStatus: 'in_pay',
          cancelReasonCode: '14',
          personIdIcm: 'ICM-1',
          personIdMis: null,
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ maxEndDate: null }] as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'SET_NOT_ELIGIBLE', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(true)
        expect(result.to).toBe('not_eligible_ip_tbd')
        const updateCall = updateSpy.mock.calls[0][0] as any
        expect(updateCall.data).not.toHaveProperty('cancelReasonCode')
        expect(updateCall.data.careEndDate).toBeInstanceOf(Date)
      })

      it('should fall back to today when staging returns blank placement end dates', async () => {
        const contact = {
          id: 1,
          csaStatus: 'in_pay',
          cancelReasonCode: null,
          personIdIcm: '1-10981225231',
          personIdMis: '',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ maxEndDate: '' }] as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'SET_NOT_ELIGIBLE', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(true)
        const updateCall = updateSpy.mock.calls[0][0] as any
        expect(updateCall.data.careEndDate).toBeInstanceOf(Date)
        expect(Number.isNaN(updateCall.data.careEndDate.getTime())).toBe(false)
      })

      it('should skip staging lookup when both person ids are blank', async () => {
        const contact = {
          id: 1,
          csaStatus: 'in_pay',
          cancelReasonCode: null,
          personIdIcm: '   ',
          personIdMis: '',
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const querySpy = vi.spyOn(prisma, '$queryRaw')
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'SET_NOT_ELIGIBLE', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(true)
        expect(querySpy).not.toHaveBeenCalled()
        const updateCall = updateSpy.mock.calls[0][0] as any
        expect(updateCall.data.careEndDate).toBeInstanceOf(Date)
      })
    })

    describe('clear cancellation fields on eligible transitions', () => {
      it('should clear cancelReasonCode and careEndDate on SET_ELIGIBLE_TBD', async () => {
        const contact = {
          id: 1,
          csaStatus: 'not_eligible_out_of_pay',
          cancelReasonCode: '21',
          careEndDate: new Date(),
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'SET_ELIGIBLE_TBD', 'USER', {
          userId: 'user1',
        })

        expect(result.success).toBe(true)
        expect(result.to).toBe('eligible_tbd')
        const updateCall = updateSpy.mock.calls[0][0] as any
        expect(updateCall.data.cancelReasonCode).toBeNull()
        expect(updateCall.data.careEndDate).toBeNull()
      })

      it('should clear cancelReasonCode and careEndDate on BECOME_ELIGIBLE', async () => {
        const contact = {
          id: 1,
          csaStatus: 'not_eligible_out_of_pay',
          cancelReasonCode: '14',
          careEndDate: new Date(),
          resumeStatus: null,
        }
        vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
        const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

        const result = await service.updateCsaStatus(1, 'BECOME_ELIGIBLE', 'SYSTEM')

        expect(result.success).toBe(true)
        expect(result.to).toBe('eligible')
        const updateCall = updateSpy.mock.calls[0][0] as any
        expect(updateCall.data.cancelReasonCode).toBeNull()
        expect(updateCall.data.careEndDate).toBeNull()
      })
    })

    it('should set icmIntegrationStatus to true on status change', async () => {
      const contact = { id: 1, csaStatus: 'eligible', resumeStatus: null }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      await service.updateCsaStatus(1, 'ADD_TO_BATCH', 'USER', { userId: 'user1' })

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            icmIntegrationStatus: true,
          }),
        }),
      )
    })

    it('should call syncSingleContact for USER actor', async () => {
      const contact = { id: 1, csaStatus: 'eligible', resumeStatus: null }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)
      const icmSync = vi.spyOn(service['icmSyncBackService'], 'syncSingleContact')

      await service.updateCsaStatus(1, 'ADD_TO_BATCH', 'USER', { userId: 'user1' })

      expect(icmSync).toHaveBeenCalledWith(1)
    })

    it('should not call syncSingleContact for USER actor when tx is provided', async () => {
      const contact = { id: 1, csaStatus: 'eligible', resumeStatus: null }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)
      const icmSync = vi.spyOn(service['icmSyncBackService'], 'syncSingleContact')

      await service.updateCsaStatus(1, 'ADD_TO_BATCH', 'USER', { userId: 'user1', tx: prisma })

      expect(icmSync).not.toHaveBeenCalled()
    })

    it('should not call syncSingleContact for SYSTEM actor', async () => {
      const contact = { id: 1, csaStatus: 'eligible', resumeStatus: null }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)
      const icmSync = vi.spyOn(service['icmSyncBackService'], 'syncSingleContact')

      await service.updateCsaStatus(1, 'ADD_TO_BATCH', 'SYSTEM')

      expect(icmSync).not.toHaveBeenCalled()
    })
  })

  describe('forceUpdateCsaStatus', () => {
    it('should update status and effective date when status changes', async () => {
      const contact = { id: 1, csaStatus: 'in_pay' }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.forceUpdateCsaStatus(1, 'not_eligible_out_of_pay', {
        din: '123',
      })

      expect(result.success).toBe(true)
      expect(result.from).toBe('in_pay')
      expect(result.to).toBe('not_eligible_out_of_pay')
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            csaStatus: 'not_eligible_out_of_pay',
            csaStatusEffectiveDate: expect.any(Date),
            din: '123',
          }),
        }),
      )
    })

    it('should skip contact update when status is already at target', async () => {
      const contact = { id: 1, csaStatus: 'not_eligible_out_of_pay' }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.forceUpdateCsaStatus(
        1,
        'not_eligible_out_of_pay',
        undefined,
        'test.origin',
      )

      expect(result.success).toBe(true)
      expect(result.from).toBe('not_eligible_out_of_pay')
      expect(result.to).toBe('not_eligible_out_of_pay')
      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('should skip contact update when status is unchanged and additionalData is empty', async () => {
      const contact = { id: 1, csaStatus: 'not_eligible_out_of_pay' }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.forceUpdateCsaStatus(1, 'not_eligible_out_of_pay', {})

      expect(result.success).toBe(true)
      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('should apply additional data without bumping status effective date when status is unchanged', async () => {
      const contact = { id: 1, csaStatus: 'not_eligible_out_of_pay', din: null }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.forceUpdateCsaStatus(1, 'not_eligible_out_of_pay', {
        din: '123',
      })

      expect(result.success).toBe(true)
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            din: '123',
            icmIntegrationStatus: true,
          }),
        }),
      )
      const updateCall = updateSpy.mock.calls[0][0] as { data: Record<string, unknown> }
      expect(updateCall.data).not.toHaveProperty('csaStatus')
      expect(updateCall.data).not.toHaveProperty('csaStatusEffectiveDate')
    })

    it('should skip contact update when status and DIN are unchanged', async () => {
      const contact = { id: 1, csaStatus: 'not_eligible_out_of_pay', din: '123' }
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      const result = await service.forceUpdateCsaStatus(1, 'not_eligible_out_of_pay', {
        din: '123',
      })

      expect(result.success).toBe(true)
      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('should return error for non-existent contact', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(null)

      const result = await service.forceUpdateCsaStatus(999, 'in_pay')

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Contact not found')
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
          status: 'approved',
          effectiveDate: new Date('2025-06-01'),
          cancelReasonCode: null,
          batch: { id: 5, batchDate: new Date('2026-01-15'), status: 'processed' },
          contact: {
            effectiveDate: new Date('2025-06-01'),
            careEndDate: null,
            cancelReasonCode: null,
          },
        },
      ]

      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      vi.spyOn(prisma.contactBatchDetail, 'findMany').mockResolvedValue(batchDetails as any)

      const result = await service.findContactBatches(1)

      expect(result).toEqual([
        {
          ...batchDetails[0],
          effectiveDate: '2025-06-01',
          cancelReasonCode: null,
          cancelReasonLabel: null,
          statusLabel: 'Approved',
          batch: { ...batchDetails[0].batch, batchDate: '2026-01-15', statusLabel: 'Processed' },
        },
      ])
      expect(prisma.contactBatchDetail.findMany).toHaveBeenCalledWith({
        where: { contactId: 1 },
        include: {
          batch: {
            select: {
              id: true,
              batchNumber: true,
              batchDate: true,
              status: true,
              systemComments: true,
            },
          },
          contact: {
            select: { effectiveDate: true, careEndDate: true, cancelReasonCode: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    })

    it('should use batch detail snapshot for cancellation transactions', async () => {
      const contact = { id: 1, firstName: 'John', lastName: 'Doe' }
      const batchDetails = [
        {
          id: 2,
          contactId: 1,
          batchId: 6,
          transactionType: 'cancellation',
          status: 'approved',
          effectiveDate: new Date('2026-01-15'),
          cancelReasonCode: '21',
          batch: { id: 6, batchDate: new Date('2026-02-20'), status: 'processed' },
          contact: {
            effectiveDate: new Date('2025-06-01'),
            careEndDate: new Date('2026-01-15'),
            cancelReasonCode: '21',
          },
        },
      ]

      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(contact as any)
      vi.spyOn(prisma.contactBatchDetail, 'findMany').mockResolvedValue(batchDetails as any)

      const result = await service.findContactBatches(1)

      expect(result[0].effectiveDate).toEqual('2026-01-15')
      expect(result[0].cancelReasonCode).toEqual('21')
      expect(result[0].cancelReasonLabel).toEqual('Child Left')
    })

    it('should throw NotFoundException if contact not found', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(null)

      await expect(service.findContactBatches(999)).rejects.toThrow(NotFoundException)
      await expect(service.findContactBatches(999)).rejects.toThrow('Contact 999 not found')
    })
  })

  describe('updateHoldReason', () => {
    it('should update hold reason and last_updated fields without changing hold_by', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'on_hold',
      } as any)
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({
        id: 1,
        holdReason: 'Reason text',
      } as any)

      await service.updateHoldReason(1, 'Reason text', 'fin.user')

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            holdReason: 'Reason text',
            lastUpdatedBy: 'fin.user',
            lastUpdatedAt: expect.any(Date),
          }),
        }),
      )
      const updateData = updateSpy.mock.calls[0][0].data as Record<string, unknown>
      expect(updateData).not.toHaveProperty('holdBy')
    })
  })

  describe('clearReviewFlag', () => {
    it('should clear needsReview without updating last_updated audit fields', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        needsReview: true,
      } as any)
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any)

      await service.clearReviewFlag(1, 'fin.user')

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { needsReview: false },
      })
    })
  })

  describe('runContactEligibility', () => {
    it('should throw NotFoundException when contact does not exist', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(null)

      await expect(service.runContactEligibility(999, 'JSMITH')).rejects.toThrow(NotFoundException)
      await expect(service.runContactEligibility(999, 'JSMITH')).rejects.toThrow(
        'Contact 999 not found',
      )
    })

    it('should map EligibilityInputError to UnprocessableEntityException', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({ personIdIcm: 'ICM-1' } as any)
      const eligibility = service['eligibilityService'] as { runForContact: any }
      eligibility.runForContact = vi
        .fn()
        .mockRejectedValue(new EligibilityInputError('Contact ICM-1 not found in staging tables'))
      const errorSpy = vi.spyOn(service['logger'], 'error').mockImplementation(() => {})

      await expect(service.runContactEligibility(1, 'JSMITH')).rejects.toThrow(
        UnprocessableEntityException,
      )
      await expect(service.runContactEligibility(1, 'JSMITH')).rejects.toThrow(
        'Contact ICM-1 not found in staging tables',
      )
      expect(errorSpy).toHaveBeenCalledWith(
        'Manual eligibility failed for contact 1: Contact ICM-1 not found in staging tables',
        {
          activityType: 'DATA_QUALITY',
          related:
            'Manual eligibility contact 1 (ICM-1) by JSMITH: Contact ICM-1 not found in staging tables',
        },
      )
      errorSpy.mockRestore()
    })

    it('should propagate generic Errors without wrapping (becomes 500 at HTTP layer)', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({ personIdIcm: 'ICM-1' } as any)
      const eligibility = service['eligibilityService'] as { runForContact: any }
      const dbError = new Error('connection terminated unexpectedly')
      eligibility.runForContact = vi.fn().mockRejectedValue(dbError)

      await expect(service.runContactEligibility(1, 'JSMITH')).rejects.toBe(dbError)
      // Specifically must NOT have been rewrapped as a 422
      await expect(service.runContactEligibility(1, 'JSMITH')).rejects.not.toBeInstanceOf(
        UnprocessableEntityException,
      )
    })

    it('should return previous and new status on success', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({ personIdIcm: 'ICM-1' } as any)
      const eligibility = service['eligibilityService'] as { runForContact: any }
      eligibility.runForContact = vi
        .fn()
        .mockResolvedValue({ previousStatus: 'eligible', newStatus: 'in_pay' })

      await expect(service.runContactEligibility(1, 'JSMITH')).resolves.toEqual({
        previousStatus: 'eligible',
        newStatus: 'in_pay',
      })
      expect(eligibility.runForContact).toHaveBeenCalledWith('ICM-1')
    })

    it('should trigger immediate ICM sync when csa_status changed', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({ personIdIcm: 'ICM-1' } as any)
      const eligibility = service['eligibilityService'] as { runForContact: any }
      eligibility.runForContact = vi
        .fn()
        .mockResolvedValue({ previousStatus: 'eligible', newStatus: 'in_pay' })
      const icmSync = vi.spyOn(service['icmSyncBackService'], 'syncSingleContact')

      await service.runContactEligibility(1, 'JSMITH')

      expect(icmSync).toHaveBeenCalledWith(1)
    })

    it('should NOT trigger ICM sync when csa_status is unchanged', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({ personIdIcm: 'ICM-1' } as any)
      const eligibility = service['eligibilityService'] as { runForContact: any }
      eligibility.runForContact = vi
        .fn()
        .mockResolvedValue({ previousStatus: 'eligible', newStatus: 'eligible' })
      const icmSync = vi.spyOn(service['icmSyncBackService'], 'syncSingleContact')

      await service.runContactEligibility(1, 'JSMITH')

      expect(icmSync).not.toHaveBeenCalled()
    })

    it('should not throw if syncSingleContact fails (flag stays for retry sweep)', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({ personIdIcm: 'ICM-1' } as any)
      const eligibility = service['eligibilityService'] as { runForContact: any }
      eligibility.runForContact = vi
        .fn()
        .mockResolvedValue({ previousStatus: 'eligible', newStatus: 'in_pay' })
      vi.spyOn(service['icmSyncBackService'], 'syncSingleContact').mockRejectedValue(
        new Error('ICM down'),
      )
      const warnSpy = vi.spyOn(service['logger'], 'warn').mockImplementation(() => {})

      await expect(service.runContactEligibility(1, 'JSMITH')).resolves.toEqual({
        previousStatus: 'eligible',
        newStatus: 'in_pay',
      })

      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith('Immediate ICM sync failed for contact 1: ICM down', {
          activityType: 'ICM',
          related: 'ICM sync failed after manual eligibility contact 1 by JSMITH',
        })
      })
      warnSpy.mockRestore()
    })
  })

  describe('updateContact (BL-36)', () => {
    it('should successfully update contact fields (DIN, status, dates)', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        din: '123456789',
      } as any)
      vi.spyOn(prisma.contact, 'findFirst').mockResolvedValue(null) // DIN unique check
      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({
        id: 1,
        din: '987654329',
        csaStatus: 'in_pay',
        csaStatusEffectiveDate: '2026-08-01',
      } as any)
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ id: 1 })

      const result = await service.updateContact(
        1,
        {
          din: '987654329',
          csaStatus: 'in_pay',
          csaStatusEffectiveDate: new Date('2026-08-01'),
        },
        'dq.steward',
        USER_PROFILE.DATA_QUALITY_STEWARD,
      )

      expect(result.success).toBe(true)
      expect(result.contact.id).toBe(1)
      expect(updateSpy).toHaveBeenCalled()
    })

    it('should reject if user profile is null', async () => {
      await expect(service.updateContact(1, { din: '123456789' }, 'user', null)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('should reject if user is not DATA_QUALITY_STEWARD', async () => {
      await expect(
        service.updateContact(1, { din: '123456789' }, 'user', USER_PROFILE.CSA_STANDARD),
      ).rejects.toThrow(ForbiddenException)
    })

    it('should reject if contact not found', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(null)

      await expect(
        service.updateContact(
          1,
          { din: '123456789' },
          'dq.steward',
          USER_PROFILE.DATA_QUALITY_STEWARD,
        ),
      ).rejects.toThrow(NotFoundException)
    })

    it('should reject if contact in protected status', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'on_hold',
        din: '123456789',
      } as any)

      await expect(
        service.updateContact(
          1,
          { din: '987654329' },
          'dq.steward',
          USER_PROFILE.DATA_QUALITY_STEWARD,
        ),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    it('should reject invalid DIN format (non-numeric or wrong length)', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        din: '123456789',
      } as any)

      await expect(
        service.updateContact(
          1,
          { din: 'INVALID' },
          'dq.steward',
          USER_PROFILE.DATA_QUALITY_STEWARD,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('should reject duplicate DIN', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        din: '123456789',
      } as any)
      vi.spyOn(prisma.contact, 'findFirst').mockResolvedValue({ id: 2 } as any)

      await expect(
        service.updateContact(
          1,
          { din: '987654329' },
          'dq.steward',
          USER_PROFILE.DATA_QUALITY_STEWARD,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('should reject future effective date', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        din: '123456789',
      } as any)

      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)

      await expect(
        service.updateContact(
          1,
          { csaStatusEffectiveDate: futureDate },
          'dq.steward',
          USER_PROFILE.DATA_QUALITY_STEWARD,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('should trigger ICM sync-back when DIN changes', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        din: '123456789',
      } as any)
      vi.spyOn(prisma.contact, 'findFirst').mockResolvedValue(null)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({ id: 1 } as any)
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ id: 1 })
      const syncSpy = vi.spyOn(service['icmSyncBackService'], 'syncSingleContact')

      await service.updateContact(
        1,
        { din: '987654329' },
        'dq.steward',
        USER_PROFILE.DATA_QUALITY_STEWARD,
      )

      expect(syncSpy).toHaveBeenCalledWith(1)
    })

    it('should trigger ICM sync-back when status changes', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        din: '123456789',
      } as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({ id: 1 } as any)
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ id: 1 })
      const syncSpy = vi.spyOn(service['icmSyncBackService'], 'syncSingleContact')

      await service.updateContact(
        1,
        { csaStatus: 'in_pay' },
        'dq.steward',
        USER_PROFILE.DATA_QUALITY_STEWARD,
      )

      expect(syncSpy).toHaveBeenCalledWith(1)
    })

    it('should trigger ICM sync-back when status effective date changes', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        din: '123456789',
      } as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({ id: 1 } as any)
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ id: 1 })
      const syncSpy = vi.spyOn(service['icmSyncBackService'], 'syncSingleContact')

      await service.updateContact(
        1,
        { csaStatusEffectiveDate: new Date('2026-08-01') },
        'dq.steward',
        USER_PROFILE.DATA_QUALITY_STEWARD,
      )

      expect(syncSpy).toHaveBeenCalledWith(1)
    })

    it('should not fail update if ICM sync-back fails', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        din: '123456789',
      } as any)
      vi.spyOn(prisma.contact, 'update').mockResolvedValue({ id: 1 } as any)
      vi.spyOn(service as any, 'findOne').mockResolvedValue({ id: 1 })
      vi.spyOn(service['icmSyncBackService'], 'syncSingleContact').mockRejectedValue(
        new Error('ICM down'),
      )

      const result = await service.updateContact(
        1,
        { csaStatus: 'in_pay' },
        'dq.steward',
        USER_PROFILE.DATA_QUALITY_STEWARD,
      )

      expect(result.success).toBe(true)
    })
  })

  describe('deleteContact (BL-37)', () => {
    it('should successfully delete contact and cascade to all tables', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        personIdIcm: 'ICM-123',
        contactIdIcm: 'CONTACT-123',
        personIdMis: 'MIS-123',
        firstName: 'John',
        lastName: 'Doe',
      } as any)

      const transactionSpy = vi.fn(async (callback) => {
        return callback({
          $executeRaw: vi.fn(),
          $queryRaw: vi
            .fn()
            .mockResolvedValue([{ batchDetails: 0n, auditTrail: 0n, wklRecords: 0n }]),
          contact: { delete: vi.fn() },
        } as any)
      })
      vi.spyOn(prisma, '$transaction').mockImplementation(transactionSpy as any)

      const result = await service.deleteContact(1, 'dq.steward', USER_PROFILE.DATA_QUALITY_STEWARD)

      expect(result.success).toBe(true)
      expect(result.message).toContain('permanently deleted')
      expect(transactionSpy).toHaveBeenCalled()
    })

    it('should reject if user profile is null', async () => {
      await expect(service.deleteContact(1, 'user', null)).rejects.toThrow(ForbiddenException)
    })

    it('should reject if user is not DATA_QUALITY_STEWARD', async () => {
      await expect(service.deleteContact(1, 'user', USER_PROFILE.CSA_STANDARD)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('should reject if contact not found', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue(null)

      await expect(
        service.deleteContact(1, 'dq.steward', USER_PROFILE.DATA_QUALITY_STEWARD),
      ).rejects.toThrow(NotFoundException)
    })

    it('should reject if contact in protected status', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'on_hold',
        personIdIcm: 'ICM-123',
        contactIdIcm: 'CONTACT-123',
        personIdMis: 'MIS-123',
        firstName: 'John',
        lastName: 'Doe',
      } as any)

      await expect(
        service.deleteContact(1, 'dq.steward', USER_PROFILE.DATA_QUALITY_STEWARD),
      ).rejects.toThrow(UnprocessableEntityException)
    })

    it('should delete from staging tables in correct order', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        personIdIcm: 'ICM-123',
        contactIdIcm: 'CONTACT-123',
        personIdMis: 'MIS-123',
        firstName: 'John',
        lastName: 'Doe',
      } as any)

      const executeRawCalls: string[] = []
      const transactionSpy = vi.fn(async (callback) => {
        return callback({
          $executeRaw: vi.fn((query) => {
            executeRawCalls.push(query[0])
            return Promise.resolve()
          }),
          $queryRaw: vi
            .fn()
            .mockResolvedValue([{ batchDetails: 0n, auditTrail: 0n, wklRecords: 0n }]),
          contact: { delete: vi.fn() },
        } as any)
      })
      vi.spyOn(prisma, '$transaction').mockImplementation(transactionSpy as any)

      await service.deleteContact(1, 'dq.steward', USER_PROFILE.DATA_QUALITY_STEWARD)

      // Verify correct deletion order (children before parents)
      expect(executeRawCalls.length).toBeGreaterThan(0)
      for (const table of CONTACT_DELETE_STAGING_TABLES) {
        expect(executeRawCalls.some((q) => q.includes(table))).toBe(true)
      }
      for (const table of CONTACT_DELETE_APPLICATION_TABLES) {
        expect(executeRawCalls.some((q) => q.includes(table))).toBe(true)
      }

      const wklIndex = executeRawCalls.findIndex((q) =>
        q.includes('DELETE FROM csa.wkl_file_records'),
      )
      const batchDetailIndex = executeRawCalls.findIndex((q) =>
        q.includes('DELETE FROM csa.contact_batch_details'),
      )
      const auditTrailIndex = executeRawCalls.findIndex((q) =>
        q.includes('DELETE FROM csa.contact_audit_trail'),
      )
      const casesIndex = executeRawCalls.findIndex((q) =>
        q.includes('DELETE FROM csa.stg_icm_cases'),
      )
      const misPlacementsIndex = executeRawCalls.findIndex((q) =>
        q.includes('DELETE FROM csa.stg_mis_placements'),
      )

      expect(wklIndex).toBeGreaterThan(-1)
      expect(batchDetailIndex).toBeGreaterThan(-1)
      expect(auditTrailIndex).toBeGreaterThan(-1)
      expect(wklIndex).toBeLessThan(batchDetailIndex)
      expect(batchDetailIndex).toBeLessThan(auditTrailIndex)
      expect(misPlacementsIndex).toBeLessThan(casesIndex)
    })

    it('should fail when FK child rows remain after dependency cleanup', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        personIdIcm: 'ICM-123',
        contactIdIcm: 'CONTACT-123',
        personIdMis: 'MIS-123',
        firstName: 'John',
        lastName: 'Doe',
      } as any)

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback({
          $executeRaw: vi.fn(),
          $queryRaw: vi
            .fn()
            .mockResolvedValue([{ batchDetails: 1n, auditTrail: 0n, wklRecords: 0n }]),
          contact: { delete: vi.fn() },
        } as any)
      })

      await expect(
        service.deleteContact(1, 'dq.steward', USER_PROFILE.DATA_QUALITY_STEWARD),
      ).rejects.toThrow('dependent rows remain')
    })

    it('should not trigger ICM sync-back on delete', async () => {
      vi.spyOn(prisma.contact, 'findUnique').mockResolvedValue({
        id: 1,
        csaStatus: 'eligible',
        personIdIcm: 'ICM-123',
        contactIdIcm: 'CONTACT-123',
        personIdMis: 'MIS-123',
        firstName: 'John',
        lastName: 'Doe',
      } as any)

      const transactionSpy = vi.fn(async (callback) => {
        return callback({
          $executeRaw: vi.fn(),
          $queryRaw: vi
            .fn()
            .mockResolvedValue([{ batchDetails: 0n, auditTrail: 0n, wklRecords: 0n }]),
          contact: { delete: vi.fn() },
        } as any)
      })
      vi.spyOn(prisma, '$transaction').mockImplementation(transactionSpy as any)

      const syncSpy = vi.spyOn(service['icmSyncBackService'], 'syncSingleContact')

      await service.deleteContact(1, 'dq.steward', USER_PROFILE.DATA_QUALITY_STEWARD)

      expect(syncSpy).not.toHaveBeenCalled()
    })
  })
})
