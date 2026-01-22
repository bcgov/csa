import type { INestApplication } from '@nestjs/common'
import { HttpException } from '@nestjs/common'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { PrismaService } from 'src/common/database/prisma.service'
import request from 'supertest'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'
import type { ContactDto } from './dto/contact.dto'

describe('UserController', () => {
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
  })
  // Close the app after each test
  afterEach(async () => {
    await app.close()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('findAll', () => {
    it('should return an array of contacts', async () => {
      const result = []
      result.push({ id: 1, last_name: 'Alice', given_names: 'Mac', csa_status: 'eligible' })
      vi.spyOn(contactsService, 'findAll').mockResolvedValue(result)
      expect(await controller.findAll()).toBe(result)
    })
  })
  describe('findOne', () => {
    it('should return a user object', async () => {
      const result: ContactDto = {
        id: 1,
        last_name: 'john',
        given_names: 'Doe',
        csa_status: 'in_pay',
      }
      vi.spyOn(contactsService, 'findOne').mockResolvedValue(result)
      expect(await controller.findOne('1')).toBe(result)
    })
    it('should throw error if user not found', async () => {
      vi.spyOn(contactsService, 'findOne').mockResolvedValue(undefined)
      try {
        await controller.findOne('1')
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException)
        expect(e.message).toBe('User not found.')
      }
    })
  })
  // Test the GET /contacts/search endpoint
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
      vi.spyOn(contactsService, 'searchContacts').mockImplementation(async () => result)

      // Make a GET request with query parameters and expect a 200 status code and the result object
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
    })

    // Test with invalid query parameters
    it('given invalid query parameters_should return a 400 status code with an error message', async () => {
      // Make a GET request with invalid query parameters and expect a 400 status code and an error message
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
      // Make a GET request with invalid query parameters and expect a 400 status code and an error message
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
