import type { INestApplication } from '@nestjs/common'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { CSAGuard } from '../common/guards/csa.guard'
import { WeeklyFilesController } from './weekly-files.controller'
import { WeeklyFilesService } from './weekly-files.service'

const mockCSAGuard = {
  canActivate: (context: { switchToHttp: () => { getRequest: () => any } }) => {
    const req = context.switchToHttp().getRequest()
    const testUsername = req.headers['x-test-username']
    if (testUsername) req.username = testUsername
    return true
  },
}

describe('WeeklyFilesController', () => {
  let app: INestApplication

  const mockWeeklyFilesService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    findRecords: vi.fn(),
    associateRecord: vi.fn(),
    dissociateRecord: vi.fn(),
    reprocess: vi.fn(),
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

  it('POST /weekly-files/:id/records/:recordId/associate associates a record', async () => {
    mockWeeklyFilesService.associateRecord.mockResolvedValue({
      id: 5,
      matchStatus: 'associated',
      csaMatchFound: 'No',
    })

    await request(app.getHttpServer())
      .post('/weekly-files/1/records/5/associate')
      .set('X-Test-Username', 'JDOE')
      .send({ contactId: 99 })
      .expect(201)
      .expect({ id: 5, matchStatus: 'associated', csaMatchFound: 'No' })

    expect(mockWeeklyFilesService.associateRecord).toHaveBeenCalledWith(1, 5, 99, 'JDOE')
  })

  it('POST /weekly-files/:id/records/:recordId/dissociate dissociates a record', async () => {
    mockWeeklyFilesService.dissociateRecord.mockResolvedValue({
      id: 5,
      matchStatus: 'unmatched',
      csaMatchFound: 'No',
    })

    await request(app.getHttpServer())
      .post('/weekly-files/1/records/5/dissociate')
      .expect(200)
      .expect({ id: 5, matchStatus: 'unmatched', csaMatchFound: 'No' })

    expect(mockWeeklyFilesService.dissociateRecord).toHaveBeenCalledWith(1, 5)
  })

  it('POST /weekly-files/:id/reprocess reprocesses associated records', async () => {
    mockWeeklyFilesService.reprocess.mockResolvedValue({
      processedRecordIds: [5, 6],
      skippedRecords: [],
    })

    await request(app.getHttpServer())
      .post('/weekly-files/1/reprocess')
      .set('X-Test-Username', 'JDOE')
      .expect(201)
      .expect({ processedRecordIds: [5, 6], skippedRecords: [] })

    expect(mockWeeklyFilesService.reprocess).toHaveBeenCalledWith(1, 'JDOE')
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
