import type { INestApplication } from '@nestjs/common'
import { HttpException } from '@nestjs/common'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import type { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { PrismaService } from 'src/common/database/prisma.service'
import request from 'supertest'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'
import type { ContactDto } from './dto/contact.dto'

describe('ContactsController', () => {
  let controller: ContactsController
  let contactsService: ContactsService
  let app: INestApplication

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactsController],
      providers: [
        ContactsService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile()
    contactsService = module.get<ContactsService>(ContactsService)
    controller = module.get<ContactsController>(ContactsController)
    app = module.createNestApplication()
    await app.init()
  }) // Close the app after each test
  afterEach(async () => {
    await app.close()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('findAll', () => {
    it('should return paginated contacts with default parameters', async () => {
      const result: PaginatedResponse<ContactDto> = {
        data: [
          { id: 1, lastName: 'Alice', givenNames: 'Mac', csaStatus: 'eligible' } as ContactDto,
        ],
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      }
      const spy = vi.spyOn(contactsService, 'findAll').mockResolvedValue(result)

      await controller.findAll()

      expect(spy).toHaveBeenCalledWith(1, 10)
    })

    it('should parse and pass custom page and limit to service', async () => {
      const result: PaginatedResponse<ContactDto> = {
        data: [],
        page: 3,
        limit: 25,
        total: 100,
        totalPages: 4,
      }
      const spy = vi.spyOn(contactsService, 'findAll').mockResolvedValue(result)

      await controller.findAll('3', '25')

      expect(spy).toHaveBeenCalledWith(3, 25)
    })

    it('should handle pagination via HTTP request', async () => {
      const result: PaginatedResponse<ContactDto> = {
        data: [],
        page: 2,
        limit: 15,
        total: 50,
        totalPages: 4,
      }
      vi.spyOn(contactsService, 'findAll').mockResolvedValue(result)

      return request(app.getHttpServer())
        .get('/contacts?page=2&limit=15')
        .expect(200)
        .expect(result)
    })
  })
  describe('findOne', () => {
    it('should return a user object', async () => {
      const result = {
        id: 1,
        lastName: 'john',
        givenNames: 'Doe',
        csaStatus: 'in_pay',
      } as ContactDto
      vi.spyOn(contactsService, 'findOne').mockResolvedValue(result)
      expect(await controller.findOne('1')).toBe(result)
    })
    it('should throw error if user not found', async () => {
      vi.spyOn(contactsService, 'findOne').mockResolvedValue(undefined as any)

      await expect(controller.findOne('1')).rejects.toThrow(HttpException)
      await expect(controller.findOne('1')).rejects.toThrow('User not found.')
    })
  }) // Test the GET /contacts/search endpoint
  describe('GET /contacts/search', () => {
    // Test with valid query parameters
    it('given valid query parameters_should return an array of users with pagination metadata', async () => {
      // Mock the contactsService.searchContacts method to return a sample result
      const result = {
        users: [
          { id: 1, name: 'Alice', email: 'alice@example.com' },
          { id: 2, name: 'Adam', email: 'Adam@example.com' },
        ],
        page: 1,
        limit: 10,
        sort: '{"name":"ASC"}',
        filter: '[{"key":"name","operation":"like","value":"A"}]',
        total: 2,
        totalPages: 1,
      }
      vi.spyOn(contactsService, 'searchContacts').mockImplementation(async () => result) // Make a GET request with query parameters and expect a 200 status code and the result object

      return request(app.getHttpServer())
        .get('/contacts/search')
        .query({
          page: 1,
          limit: 10,
          sort: '{"name":"ASC"}',
          filter: '[{"key":"name","operation":"like","value":"A"}]',
        })
        .expect(200)
        .expect(result)
    }) // Test with invalid query parameters

    it('given invalid query parameters_should return a 400 status code with an error message', async () => {
      return request(app.getHttpServer())
        .get('/contacts/search')
        .query({
          page: 'invalid',
          limit: 'invalid',
        })
        .expect(400)
        .expect({
          statusCode: 400,
          message: 'Invalid query parameters',
        })
    })
    it('given sort and filter as invalid query parameters_should return a 400 status code with an error message', async () => {
      vi.spyOn(contactsService, 'searchContacts').mockImplementation(async () => {
        throw new HttpException('Invalid query parameters', 400)
      })
      return request(app.getHttpServer())
        .get('/contacts/search')
        .query({
          page: 1,
          limit: 10,
          sort: 'invalid',
          filter: 'invalid',
        })
        .expect(400)
        .expect({
          statusCode: 400,
          message: 'Invalid query parameters',
        })
    })
  })
})
