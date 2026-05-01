import type { INestApplication } from '@nestjs/common'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'
import request from 'supertest'
import { JobRunner } from 'src/jobs/job-runner.service'
import { JobsService } from 'src/jobs/jobs.service'
import { CSAGuard } from '../common/guards/csa.guard'
import { JobsController } from './jobs.controller'

const mockCSAGuard = { canActivate: () => true }

describe('JobsController', () => {
  let app: INestApplication
  let controller: JobsController

  const mockJobRunner = {
    executeJob: vi.fn(),
  }

  const mockJobsService = {
    createJob: vi.fn(),
    getJob: vi.fn(),
    getJobs: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        { provide: JobRunner, useValue: mockJobRunner },
        { provide: JobsService, useValue: mockJobsService },
      ],
    })
      .overrideGuard(CSAGuard)
      .useValue(mockCSAGuard)
      .compile()

    app = module.createNestApplication()
    await app.init()

    controller = module.get<JobsController>(JobsController)
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await app.close()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('GET /jobs', () => {
    it('should return paginated job list with shaped fields', async () => {
      const now = new Date('2026-01-01T00:00:00Z')
      const mockServiceResponse = {
        data: [
          {
            id: 1,
            jobType: 'RUN_ELIGIBILITY',
            status: 'SUCCESS',
            jobTrigger: 'CRON',
            retryCount: 0,
            error: null,
            metadata: null,
            createdAt: now,
            startedAt: now,
            completedAt: now,
            parentJobId: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      }
      mockJobsService.getJobs.mockResolvedValue(mockServiceResponse)

      const res = await request(app.getHttpServer()).get('/jobs').expect(200)

      expect(res.body).toEqual({
        data: [
          {
            id: 1,
            jobType: 'RUN_ELIGIBILITY',
            status: 'SUCCESS',
            jobTrigger: 'CRON',
            retryCount: 0,
            error: null,
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            startedAt: '2026-01-01T00:00:00.000Z',
            completedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      })
      expect(mockJobsService.getJobs).toHaveBeenCalledWith({
        jobType: undefined,
        status: undefined,
        page: 1,
        limit: 20,
      })
    })

    it('should pass filters to service', async () => {
      mockJobsService.getJobs.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 })

      await request(app.getHttpServer())
        .get('/jobs?jobType=AUTO_BATCH&status=FAILED&page=2&limit=10')
        .expect(200)

      expect(mockJobsService.getJobs).toHaveBeenCalledWith({
        jobType: 'AUTO_BATCH',
        status: 'FAILED',
        page: 2,
        limit: 10,
      })
    })

    it('should cap limit at 200', async () => {
      mockJobsService.getJobs.mockResolvedValue({ data: [], total: 0, page: 1, limit: 200 })

      await request(app.getHttpServer()).get('/jobs?limit=999').expect(200)

      expect(mockJobsService.getJobs).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }))
    })

    it('should fall back to default limit when negative', async () => {
      mockJobsService.getJobs.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 })

      await request(app.getHttpServer()).get('/jobs?limit=-5').expect(200)

      expect(mockJobsService.getJobs).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }))
    })

    it('should fall back to default page when zero or negative', async () => {
      mockJobsService.getJobs.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 })

      await request(app.getHttpServer()).get('/jobs?page=0').expect(200)

      expect(mockJobsService.getJobs).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
    })
  })

  describe('POST /jobs/run-eligibility', () => {
    it('should create a job and return jobRunId', async () => {
      mockJobsService.createJob.mockResolvedValue({ id: 42 })
      mockJobRunner.executeJob.mockResolvedValue({ success: true })

      const res = await request(app.getHttpServer()).post('/jobs/run-eligibility').expect(201)

      expect(res.body).toEqual({ jobRunId: 42 })
      expect(mockJobsService.createJob).toHaveBeenCalledWith({
        jobType: 'RUN_ELIGIBILITY',
        jobTrigger: 'END_USER',
      })
    })

    it('should fire executeJob without awaiting', async () => {
      mockJobsService.createJob.mockResolvedValue({ id: 10 })
      let executeCalled = false
      mockJobRunner.executeJob.mockImplementation(async () => {
        executeCalled = true
        return { success: true }
      })

      await request(app.getHttpServer()).post('/jobs/run-eligibility').expect(201)

      // Give the microtask queue a chance to flush
      await new Promise((r) => setTimeout(r, 10))
      expect(executeCalled).toBe(true)
    })

    it('should return 500 when createJob throws', async () => {
      mockJobsService.createJob.mockRejectedValue(new Error('DB error'))

      await request(app.getHttpServer()).post('/jobs/run-eligibility').expect(500)
    })

    it('should suppress executeJob rejection and still return 201', async () => {
      mockJobsService.createJob.mockResolvedValue({ id: 11 })
      mockJobRunner.executeJob.mockRejectedValue(new Error('job crashed'))

      const res = await request(app.getHttpServer()).post('/jobs/run-eligibility').expect(201)

      expect(res.body).toEqual({ jobRunId: 11 })
    })

    it('should return 409 when same job type is already RUNNING (P2002)', async () => {
      const uniqueErr = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      })
      mockJobsService.createJob.mockRejectedValue(uniqueErr)

      const res = await request(app.getHttpServer()).post('/jobs/run-eligibility').expect(409)

      expect(res.body.message).toContain('RUN_ELIGIBILITY')
      expect(res.body.message).toContain('already running')
      expect(mockJobRunner.executeJob).not.toHaveBeenCalled()
    })
  })

  describe('POST /jobs/auto-batch', () => {
    it('should create a job and return jobRunId', async () => {
      mockJobsService.createJob.mockResolvedValue({ id: 99 })
      mockJobRunner.executeJob.mockResolvedValue({ success: true })

      const res = await request(app.getHttpServer()).post('/jobs/auto-batch').expect(201)

      expect(res.body).toEqual({ jobRunId: 99 })
      expect(mockJobsService.createJob).toHaveBeenCalledWith({
        jobType: 'AUTO_BATCH',
        jobTrigger: 'END_USER',
      })
    })

    it('should return 409 when AUTO_BATCH is already RUNNING (P2002)', async () => {
      const uniqueErr = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      })
      mockJobsService.createJob.mockRejectedValue(uniqueErr)

      await request(app.getHttpServer()).post('/jobs/auto-batch').expect(409)

      expect(mockJobRunner.executeJob).not.toHaveBeenCalled()
    })
  })

  describe('GET /jobs/:id', () => {
    it('should return job status', async () => {
      const job = {
        id: 5,
        jobType: 'RUN_ELIGIBILITY',
        status: 'SUCCESS',
        jobTrigger: 'END_USER',
        retryCount: 0,
        error: null,
        metadata: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        startedAt: new Date('2026-01-01T00:00:01Z'),
        completedAt: new Date('2026-01-01T00:01:00Z'),
      }
      mockJobsService.getJob.mockResolvedValue(job)

      const res = await request(app.getHttpServer()).get('/jobs/5').expect(200)

      expect(res.body).toEqual({
        id: 5,
        jobType: 'RUN_ELIGIBILITY',
        status: 'SUCCESS',
        jobTrigger: 'END_USER',
        retryCount: 0,
        error: null,
        metadata: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        startedAt: '2026-01-01T00:00:01.000Z',
        completedAt: '2026-01-01T00:01:00.000Z',
      })
    })

    it('should return 404 when job not found', async () => {
      mockJobsService.getJob.mockResolvedValue(null)

      await request(app.getHttpServer()).get('/jobs/999').expect(404)
    })
  })
})
