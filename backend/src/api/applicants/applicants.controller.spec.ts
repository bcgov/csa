import type { INestApplication } from '@nestjs/common'
import { HttpException } from '@nestjs/common'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { PrismaService } from 'src/common/database/prisma.service'
import request from 'supertest'
import { ApplicantsController } from './applicants.controller'
import { ApplicantsService } from './applicants.service'
import type { ApplicantDto } from './dto/applicant.dto'
import type { CreateApplicantDto } from './dto/create-applicant.dto'
import type { UpdateApplicantDto } from './dto/update-applicant.dto'

describe('UserController', () => {
  let controller: ApplicantsController
  let applicantsService: ApplicantsService
  let app: INestApplication

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApplicantsController],
      providers: [
        ApplicantsService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile()
    applicantsService = module.get<ApplicantsService>(ApplicantsService)
    controller = module.get<ApplicantsController>(ApplicantsController)
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

  describe('create', () => {
    it('should call the service create method with the given dto and return the result', async () => {
      // Arrange
      const createApplicantDto: CreateApplicantDto = {
        csa_status: 'test@example.com',
        last_name: 'Jonh',
        given_name: 'Doe',
      }
      const expectedResult = {
        id: 1,
        ...createApplicantDto,
      }
      vi.spyOn(applicantsService, 'create').mockResolvedValue(expectedResult)

      // Act
      const result = await controller.create(createApplicantDto)

      // Assert
      expect(applicantsService.create).toHaveBeenCalledWith(createApplicantDto)
      expect(result).toEqual(expectedResult)
    })
  })
  describe('findAll', () => {
    it('should return an array of users', async () => {
      const result = []
      result.push({ id: 1, last_name: 'Alice', given_name: 'Mac', csa_status: 'eligible' })
      vi.spyOn(applicantsService, 'findAll').mockResolvedValue(result)
      expect(await controller.findAll()).toBe(result)
    })
  })
  describe('findOne', () => {
    it('should return a user object', async () => {
      const result: ApplicantDto = {
        id: 1,
        last_name: 'john',
        given_name: 'Doe',
        csa_status: 'in_pay',
      }
      vi.spyOn(applicantsService, 'findOne').mockResolvedValue(result)
      expect(await controller.findOne('1')).toBe(result)
    })
    it('should throw error if user not found', async () => {
      vi.spyOn(applicantsService, 'findOne').mockResolvedValue(undefined)
      try {
        await controller.findOne('1')
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException)
        expect(e.message).toBe('User not found.')
      }
    })
  })
  describe('update', () => {
    it('should update and return a user object', async () => {
      const id = '1'
      const updateApplicantDto: UpdateApplicantDto = {
        email: 'johndoe@example.com',
        name: 'John Doe',
      }
      const ApplicantDto: ApplicantDto = {
        id: 1,
        name: 'John Doe',
        email: 'johndoe@example.com',
      }
      vi.spyOn(applicantsService, 'update').mockResolvedValue(ApplicantDto)

      expect(await controller.update(id, updateApplicantDto)).toBe(ApplicantDto)
      expect(applicantsService.update).toHaveBeenCalledWith(+id, updateApplicantDto)
    })
  })
  describe('remove', () => {
    it('should remove a user', async () => {
      const id = '1'
      vi.spyOn(applicantsService, 'remove').mockResolvedValue(undefined)

      expect(await controller.remove(id)).toBeUndefined()
      expect(applicantsService.remove).toHaveBeenCalledWith(+id)
    })
  })
  // Test the GET /applicants/search endpoint
  describe('GET /applicants/search', () => {
    // Test with valid query parameters
    it('given valid query parameters_should return an array of users with pagination metadata', async () => {
      // Mock the applicantsService.searchApplicants method to return a sample result
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
      vi.spyOn(applicantsService, 'searchApplicants').mockImplementation(async () => result)

      // Make a GET request with query parameters and expect a 200 status code and the result object
      return request(app.getHttpServer())
        .get('/applicants/search')
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
        .get('/applicants/search')
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
      vi.spyOn(applicantsService, 'searchApplicants').mockImplementation(async () => {
        throw new HttpException('Invalid query parameters', 400)
      })
      return request(app.getHttpServer())
        .get('/applicants/search')
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
