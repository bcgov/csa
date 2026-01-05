// import type { TestingModule } from '@nestjs/testing'
// import { Test } from '@nestjs/testing'
// import { PrismaService } from 'src/common/database/prisma.service'
// import { Prisma } from '../../../generated/prisma/client'
// import { ApplicantsService } from './applicants.service'

// describe('UserService', () => {
//   let service: ApplicantsService
//   let prisma: PrismaService

//   const savedApplicant1 = {
//     id: new Prisma.Decimal(1),
//     last_name: 'Test Numone',
//     given_name: 'numone@test.com',
//     csa_status: '',
//   }
//   const savedApplicant2 = {
//     id: new Prisma.Decimal(2),
//     last_name: 'Test Numtwo',
//     given_name: 'numtwo@test.com',
//     csa_status: '',
//   }
//   const oneUser = {
//     id: 1,
//     last_name: 'Test Numone',
//     given_name: 'numone@test.com',
//     csa_status: '',
//   }
//   const updateUser = {
//     id: 1,
//     last_name: 'Test Numone update',
//     given_name: 'numoneupdate@test.com',
//     csa_status: '',
//   }
//   const updatedUser = {
//     id: new Prisma.Decimal(1),
//     last_name: 'Test Numone update',
//     given_name: 'numoneupdate@test.com',
//     csa_status: '',
//   }

//   const twoUser = {
//     id: 2,
//     last_name: 'Test Numtwo',
//     given_name: 'numtwo@test.com',
//     csa_status: '',
//   }

//   const userArray = [oneUser, twoUser]
//   const savedApplicantArray = [savedApplicant1, savedApplicant2]

//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         ApplicantsService,
//         {
//           provide: PrismaService,
//           useValue: {
//             users: {
//               findMany: vi.fn().mockResolvedValue(savedApplicantArray),
//               findUnique: vi.fn().mockResolvedValue(savedApplicant1),
//               create: vi.fn().mockResolvedValue(savedApplicant1),
//               update: vi.fn().mockResolvedValue(updatedUser),
//               delete: vi.fn().mockResolvedValue(true),
//               count: vi.fn(),
//             },
//           },
//         },
//       ],
//     }).compile()

//     service = module.get<ApplicantsService>(ApplicantsService)
//     prisma = module.get<PrismaService>(PrismaService)
//   })

//   it('should be defined', () => {
//     expect(service).toBeDefined()
//   })

//   describe('createOne', () => {
//     it('should successfully add a user', async () => {
//       await expect(service.create(oneUser)).resolves.toEqual(oneUser)
//       expect(prisma.users.create).toBeCalledTimes(1)
//     })
//   })

//   describe('findAll', () => {
//     it('should return an array of users', async () => {
//       const users = await service.findAll()
//       expect(users).toEqual(userArray)
//     })
//   })

//   describe('findOne', () => {
//     it('should get a single user', async () => {
//       await expect(service.findOne(1)).resolves.toEqual(oneUser)
//     })
//   })

//   describe('update', () => {
//     it('should call the update method', async () => {
//       const user = await service.update(1, updateUser)
//       expect(user).toEqual(updateUser)
//       expect(prisma.users.update).toBeCalledTimes(1)
//     })
//   })

//   describe('remove', () => {
//     it('should return {deleted: true}', async () => {
//       await expect(service.remove(2)).resolves.toEqual({ deleted: true })
//     })
//     it('should return {deleted: false, message: err.message}', async () => {
//       const repoSpy = vi
//         .spyOn(prisma.users, 'delete')
//         .mockRejectedValueOnce(new Error('Bad Delete Method.'))
//       await expect(service.remove(-1)).resolves.toEqual({
//         deleted: false,
//         message: 'Bad Delete Method.',
//       })
//       expect(repoSpy).toBeCalledTimes(1)
//     })
//   })

//   describe('searchApplicants', () => {
//     it('should return a list of users with pagination and filtering', async () => {
//       const page = 1
//       const limit = 10
//       const sortObject: Prisma.SortOrder = 'asc'
//       const sort: any = `[{ "name": "${sortObject}" }]`
//       const filter: any = '[{ "name": { "equals": "Peter" } }]'

//       vi.spyOn(prisma.users, 'findMany').mockResolvedValue([])
//       vi.spyOn(prisma.users, 'count').mockResolvedValue(0)
//       const result = await service.searchApplicants(page, limit, sort, filter)

//       expect(result).toEqual({
//         users: [],
//         page,
//         limit,
//         total: 0,
//         totalPages: 0,
//       })
//     })

//     it('given no page should return a list of users with pagination and filtering with default page 1', async () => {
//       const limit = 10
//       const sortObject: Prisma.SortOrder = 'asc'
//       const sort: any = `[{ "name": "${sortObject}" }]`
//       const filter: any = '[{ "name": { "equals": "Peter" } }]'

//       vi.spyOn(prisma.users, 'findMany').mockResolvedValue([])
//       vi.spyOn(prisma.users, 'count').mockResolvedValue(0)
//       const result = await service.searchApplicants(null, limit, sort, filter)

//       expect(result).toEqual({
//         users: [],
//         page: 1,
//         limit,
//         total: 0,
//         totalPages: 0,
//       })
//     })
//     it('given no limit should return a list of users with pagination and filtering with default limit 10', async () => {
//       const page = 1
//       const sortObject: Prisma.SortOrder = 'asc'
//       const sort: any = `[{ "name": "${sortObject}" }]`
//       const filter: any = '[{ "name": { "equals": "Peter" } }]'

//       vi.spyOn(prisma.users, 'findMany').mockResolvedValue([])
//       vi.spyOn(prisma.users, 'count').mockResolvedValue(0)
//       const result = await service.searchApplicants(page, null, sort, filter)

//       expect(result).toEqual({
//         users: [],
//         page: 1,
//         limit: 10,
//         total: 0,
//         totalPages: 0,
//       })
//     })

//     it('given  limit greater than 200 should return a list of users with pagination and filtering with default limit 10', async () => {
//       const page = 1
//       const limit = 201
//       const sortObject: Prisma.SortOrder = 'asc'
//       const sort: any = `[{ "name": "${sortObject}" }]`
//       const filter: any = '[{ "name": { "equals": "Peter" } }]'

//       vi.spyOn(prisma.users, 'findMany').mockResolvedValue([])
//       vi.spyOn(prisma.users, 'count').mockResolvedValue(0)
//       const result = await service.searchApplicants(page, limit, sort, filter)

//       expect(result).toEqual({
//         users: [],
//         page: 1,
//         limit: 10,
//         total: 0,
//         totalPages: 0,
//       })
//     })
//     it('given  invalid JSON should throw error', async () => {
//       const page = 1
//       const limit = 201
//       const sortObject: Prisma.SortOrder = 'asc'
//       const sort: any = `[{ "name" "${sortObject}" }]`
//       const filter: any = '[{ "name": { "equals": "Peter" } }]'
//       try {
//         await service.searchApplicants(page, limit, sort, filter)
//       } catch (e) {
//         expect(e).toEqual(new Error('Invalid query parameters'))
//       }
//     })
//   })
//   describe('convertFiltersToPrismaFormat', () => {
//     it("should convert input filters to prisma's filter format", () => {
//       const inputFilter = [
//         { key: 'a', operation: 'like', value: '1' },
//         { key: 'b', operation: 'eq', value: '2' },
//         { key: 'c', operation: 'neq', value: '3' },
//         { key: 'd', operation: 'gt', value: '4' },
//         { key: 'e', operation: 'gte', value: '5' },
//         { key: 'f', operation: 'lt', value: '6' },
//         { key: 'g', operation: 'lte', value: '7' },
//         { key: 'h', operation: 'in', value: ['8'] },
//         { key: 'i', operation: 'notin', value: ['9'] },
//         { key: 'j', operation: 'isnull', value: '10' },
//       ]

//       const expectedOutput = {
//         a: { contains: '1' },
//         b: { equals: '2' },
//         c: { not: { equals: '3' } },
//         d: { gt: '4' },
//         e: { gte: '5' },
//         f: { lt: '6' },
//         g: { lte: '7' },
//         h: { in: ['8'] },
//         i: { not: { in: ['9'] } },
//         j: { equals: null },
//       }

//       expect(service.convertFiltersToPrismaFormat(inputFilter)).toStrictEqual(expectedOutput)
//     })
//   })
// })
