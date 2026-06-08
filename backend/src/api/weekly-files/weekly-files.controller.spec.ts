import type { INestApplication } from '@nestjs/common'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { CSAGuard } from '../common/guards/csa.guard'
import { WeeklyFilesController } from './weekly-files.controller'
import { WeeklyFilesService } from './weekly-files.service'

const mockCSAGuard = {
  canActivate: () => true,
}

describe('WeeklyFilesController', () => {
  let app: INestApplication

  const mockWeeklyFilesService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    findRecords: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WeeklyFilesController],
      providers: [{ provide: WeeklyFilesService, useValue: mockWeeklyFilesService }],
    })
      .overrideGuard(CSAGuard)
      .useValue(mockCSAGuard)
      .compile()

    app = module.createNestApplication()
    await app.init()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await app.close()
  })

  it('GET /weekly-files returns summaries', async () => {
    mockWeeklyFilesService.findAll.mockResolvedValue({
      data: [{ id: 1, fileName: 'craUserId.AWKL0001.txt', totalCount: 2 }],
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    })

    await request(app.getHttpServer()).get('/weekly-files').expect(200).expect({
      data: [{ id: 1, fileName: 'craUserId.AWKL0001.txt', totalCount: 2 }],
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    })
  })

  it('GET /weekly-files/:id/records returns detail rows', async () => {
    mockWeeklyFilesService.findRecords.mockResolvedValue({
      data: [{ id: 5, csaMatchFound: 'No' }],
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    })

    await request(app.getHttpServer())
      .get('/weekly-files/1/records')
      .expect(200)
      .expect({
        data: [{ id: 5, csaMatchFound: 'No' }],
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      })
  })
})
