import type { INestApplication } from '@nestjs/common'
import { NotFoundException } from '@nestjs/common'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { CSAGuard } from '../common/guards/csa.guard'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'

// Mock guard that always allows access
const mockCSAGuard = {
  canActivate: () => true,
}

describe('ContactsController', () => {
  let controller: ContactsController
  let service: ContactsService
  let app: INestApplication

  const mockContacts = [
    { id: 1, lastName: 'Doe', fisrtNames: 'John', csaStatus: 'eligible' },
    { id: 2, lastName: 'Smith', fisrtNames: 'Jane', csaStatus: 'in_pay' },
  ]

  const mockPaginatedResponse = {
    data: mockContacts,
    page: 1,
    limit: 10,
    total: 2,
    totalPages: 1,
  }

  const mockContactsService = {
    findAll: vi.fn().mockResolvedValue(mockPaginatedResponse),
    findOne: vi.fn().mockResolvedValue(mockContacts[0]),
    fullTextSearch: vi.fn().mockResolvedValue(mockPaginatedResponse),
    resumeContacts: vi.fn(),
    holdContacts: vi.fn(),
    findContactBatches: vi.fn(),
    updateEligibilityStatus: vi.fn(),
    updateNotEligibleStatus: vi.fn(),
    updateChildOver18: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactsController],
      providers: [
        {
          provide: ContactsService,
          useValue: mockContactsService,
        },
      ],
    })
      .overrideGuard(CSAGuard)
      .useValue(mockCSAGuard)
      .compile()

    controller = module.get<ContactsController>(ContactsController)
    service = module.get<ContactsService>(ContactsService)
    app = module.createNestApplication()
    await app.init()

    vi.clearAllMocks()
  })

  afterEach(async () => {
    await app.close()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('findAll', () => {
    it('should return paginated contacts with default parameters', async () => {
      const result = await controller.findAll()
      expect(result).toEqual(mockPaginatedResponse)
      expect(service.findAll).toHaveBeenCalledWith(1, 10, undefined, undefined)
    })

    it('should parse and pass custom page and limit to service', async () => {
      await controller.findAll('2', '20')
      expect(service.findAll).toHaveBeenCalledWith(2, 20, undefined, undefined)
    })

    it('should handle pagination via HTTP request', async () => {
      const response = await request(app.getHttpServer())
        .get('/contacts?page=2&limit=20')
        .expect(200)

      expect(response.body).toEqual(mockPaginatedResponse)
      expect(service.findAll).toHaveBeenCalledWith(2, 20, undefined, undefined)
    })

    it('should pass sort and filter to service', async () => {
      const sort = '[{"lastName":"desc"}]'
      const filter = '[{"key":"csaStatus","op":"eq","value":"eligible"}]'

      await controller.findAll('1', '10', sort, filter)
      expect(service.findAll).toHaveBeenCalledWith(1, 10, sort, filter)
    })

    it('should handle only sort parameter', async () => {
      const sort = '[{"lastName":"asc"}]'

      await controller.findAll('1', '10', sort)
      expect(service.findAll).toHaveBeenCalledWith(1, 10, sort, undefined)
    })
  })

  describe('findOne', () => {
    it('should return a user object', async () => {
      const result = await controller.findOne('1')
      expect(result).toEqual(mockContacts[0])
    })

    it('should throw error if user not found', async () => {
      mockContactsService.findOne.mockRejectedValueOnce(
        new NotFoundException('Contact 999 not found'),
      )
      await expect(controller.findOne('999')).rejects.toThrow(NotFoundException)
    })
  })

  describe('GET /contacts/search', () => {
    it('should return paginated search results', async () => {
      const response = await request(app.getHttpServer()).get('/contacts/search?q=doe').expect(200)

      expect(response.body).toEqual(mockPaginatedResponse)
      expect(service.fullTextSearch).toHaveBeenCalledWith('doe', 1, 10)
    })

    it('should handle pagination parameters', async () => {
      await request(app.getHttpServer()).get('/contacts/search?q=doe&page=2&limit=20').expect(200)

      expect(service.fullTextSearch).toHaveBeenCalledWith('doe', 2, 20)
    })

    it('should return 400 when query is missing', async () => {
      await request(app.getHttpServer()).get('/contacts/search').expect(400)
    })

    it('should return 400 when query is empty', async () => {
      await request(app.getHttpServer()).get('/contacts/search?q=').expect(400)
    })

    it('should return 400 when query is less than 2 characters', async () => {
      return request(app.getHttpServer())
        .get('/contacts/search?q=a')
        .expect(400)
        .expect({ statusCode: 400, message: 'Search query must be at least 2 characters' })
    })
  })

  describe('POST /contacts/hold', () => {
    it('should return bulk hold result', async () => {
      const result = {
        success: [1, 2],
        skipped: [
          { id: 3, reason: 'invalid_transition' },
          { id: 999, reason: 'not_found' },
        ],
      }
      vi.spyOn(service, 'holdContacts').mockResolvedValue(result)

      return request(app.getHttpServer())
        .post('/contacts/hold')
        .send({ contactIds: [1, 2, 3, 999] })
        .expect(201)
        .expect(result)
    })

    it('should call service with correct parameters', async () => {
      const result = { success: [1], skipped: [] }
      const spy = vi.spyOn(service, 'holdContacts').mockResolvedValue(result)

      await request(app.getHttpServer())
        .post('/contacts/hold')
        .send({ contactIds: [1, 2, 3] })
        .expect(201)

      expect(spy).toHaveBeenCalledWith([1, 2, 3], 'system')
    })
  })

  describe('POST /contacts/resume', () => {
    it('should return bulk resume result', async () => {
      const result = {
        success: [1, 2],
        skipped: [
          { id: 3, reason: 'invalid_transition' },
          { id: 999, reason: 'not_found' },
        ],
      }
      vi.spyOn(service, 'resumeContacts').mockResolvedValue(result)

      return request(app.getHttpServer())
        .post('/contacts/resume')
        .send({ contactIds: [1, 2, 3, 999] })
        .expect(201)
        .expect(result)
    })

    it('should call service with correct parameters', async () => {
      const result = { success: [1], skipped: [] }
      const spy = vi.spyOn(service, 'resumeContacts').mockResolvedValue(result)

      await request(app.getHttpServer())
        .post('/contacts/resume')
        .send({ contactIds: [1, 2, 3] })
        .expect(201)

      expect(spy).toHaveBeenCalledWith([1, 2, 3], 'system')
    })
  })

  describe('POST /contacts/set-eligible', () => {
    it('should return bulk eligibility status update result', async () => {
      const result = {
        success: [1, 2],
        skipped: [
          { id: 3, reason: 'invalid_transition' },
          { id: 999, reason: 'not_found' },
        ],
      }
      vi.spyOn(service, 'updateEligibilityStatus').mockResolvedValue(result)

      return request(app.getHttpServer())
        .post('/contacts/set-eligible')
        .send({ contactIds: [1, 2, 3, 999], action: 'ELIGIBLE' })
        .expect(201)
        .expect(result)
    })

    it('should call service with correct parameters', async () => {
      const result = { success: [1], skipped: [] }
      const spy = vi.spyOn(service, 'updateEligibilityStatus').mockResolvedValue(result)

      await request(app.getHttpServer())
        .post('/contacts/set-eligible')
        .send({ contactIds: [1, 2, 3], action: 'ELIGIBLE' })
        .expect(201)

      expect(spy).toHaveBeenCalledWith([1, 2, 3], 'ELIGIBLE', 'system')
    })
  })

  describe('POST /contacts/set-not-eligible', () => {
    it('should return bulk not eligible status update result', async () => {
      const result = {
        success: [1, 2],
        skipped: [
          { id: 3, reason: 'invalid_transition' },
          { id: 999, reason: 'not_found' },
        ],
      }
      vi.spyOn(service, 'updateNotEligibleStatus').mockResolvedValue(result)

      return request(app.getHttpServer())
        .post('/contacts/set-not-eligible')
        .send({ contactIds: [1, 2, 3, 999], action: 'SET_NOT_ELIGIBLE' })
        .expect(201)
        .expect(result)
    })

    it('should call service with correct parameters', async () => {
      const result = { success: [1], skipped: [] }
      const spy = vi.spyOn(service, 'updateNotEligibleStatus').mockResolvedValue(result)

      await request(app.getHttpServer())
        .post('/contacts/set-not-eligible')
        .send({ contactIds: [1, 2, 3], action: 'SET_NOT_ELIGIBLE' })
        .expect(201)

      expect(spy).toHaveBeenCalledWith([1, 2, 3], 'SET_NOT_ELIGIBLE', 'system')
    })
  })

  describe('POST /contacts/age-out', () => {
    it('should return bulk child over 18 status update result', async () => {
      const result = {
        success: [1, 2],
        skipped: [
          { id: 3, reason: 'invalid_transition' },
          { id: 999, reason: 'not_found' },
        ],
      }
      vi.spyOn(service, 'updateChildOver18').mockResolvedValue(result)

      return request(app.getHttpServer())
        .post('/contacts/age-out')
        .send({ contactIds: [1, 2, 3, 999], action: 'AGE_OUT' })
        .expect(201)
        .expect(result)
    })

    it('should call service with correct parameters', async () => {
      const result = { success: [1], skipped: [] }
      const spy = vi.spyOn(service, 'updateChildOver18').mockResolvedValue(result)

      await request(app.getHttpServer())
        .post('/contacts/age-out')
        .send({ contactIds: [1, 2, 3], action: 'AGE_OUT' })
        .expect(201)

      expect(spy).toHaveBeenCalledWith([1, 2, 3], 'AGE_OUT', 'system')
    })
  })

  describe('GET /contacts/:id/batches', () => {
    it('should return batch details for a contact', async () => {
      const batchDetails = [
        {
          id: 1,
          contactId: 1,
          batchId: 5,
          transactionType: 'application',
          batch: { id: 5, batchDate: '2026-01-15', status: 'processed' },
        },
      ]
      vi.spyOn(service, 'findContactBatches').mockResolvedValue(batchDetails as any)

      return request(app.getHttpServer())
        .get('/contacts/1/batches')
        .expect(200)
        .expect(batchDetails)
    })
  })
})
