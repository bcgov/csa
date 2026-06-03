import type { INestApplication } from '@nestjs/common'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'
import { JobRunner } from 'src/jobs/job-runner.service'
import { JobsService } from 'src/jobs/jobs.service'
import { OpenshiftJobLauncher } from 'src/jobs/openshift-job-launcher.service'
import request from 'supertest'
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
    markFailed: vi.fn(),
  }

  const mockOpenshiftJobLauncher = {
    isEnabled: vi.fn().mockReturnValue(false),
    launchJob: vi.fn().mockResolvedValue({
      success: false,
      jobName: '',
      message: 'OpenShift disabled',
    }),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        { provide: JobRunner, useValue: mockJobRunner },
        { provide: JobsService, useValue: mockJobsService },
        { provide: OpenshiftJobLauncher, useValue: mockOpenshiftJobLauncher },
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

      expect(res.body.total).toBe(1)
      expect(mockJobsService.getJobs).toHaveBeenCalledWith({
        jobType: undefined,
        status: undefined,
        page: 1,
        limit: 20,
      })
    })
  })

  describe('POST /jobs/run-eligibility', () => {
    it('should create a job and return jobRunId when OpenShift is enabled', async () => {
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(true)
      mockOpenshiftJobLauncher.launchJob.mockResolvedValue({
        success: true,
        jobName: 'csa-run-eligibility-42',
        message: 'Job launched successfully',
      })
      mockJobsService.createJob.mockResolvedValue({ id: 42 })

      const res = await request(app.getHttpServer()).post('/jobs/run-eligibility').expect(201)

      expect(res.body).toEqual({
        jobRunId: 42,
        message: 'Job launched successfully',
        openshiftJobName: 'csa-run-eligibility-42',
      })
      expect(mockJobsService.createJob).toHaveBeenCalledWith({
        jobType: 'RUN_ELIGIBILITY',
        jobTrigger: 'END_USER',
      })
      expect(mockOpenshiftJobLauncher.launchJob).toHaveBeenCalledWith('RUN_ELIGIBILITY', 42)
    })

    it('should fail request and mark job as failed when launchJob fails', async () => {
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(true)
      mockOpenshiftJobLauncher.launchJob.mockResolvedValue({
        success: false,
        jobName: '',
        message: 'Failed to launch: CronJob not found',
      })
      mockJobsService.createJob.mockResolvedValue({ id: 10 })

      const res = await request(app.getHttpServer()).post('/jobs/run-eligibility').expect(503)

      expect(res.body.message).toBe('Failed to launch: CronJob not found')
      expect(mockJobsService.markFailed).toHaveBeenCalledWith(
        10,
        'Failed to launch: CronJob not found',
      )
    })

    it('should return immediately when OpenShift is disabled', async () => {
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(false)
      mockJobsService.createJob.mockResolvedValue({ id: 501 })
      mockJobRunner.executeJob.mockResolvedValue({ success: true })

      const res = await request(app.getHttpServer()).post('/jobs/run-eligibility').expect(201)

      expect(res.body).toEqual({
        jobRunId: 501,
        message: 'OpenShift disabled; running RUN_ELIGIBILITY in API process',
      })
      expect(mockJobRunner.executeJob).toHaveBeenCalledWith(501)
      expect(mockOpenshiftJobLauncher.launchJob).not.toHaveBeenCalled()
    })

    it('should return 409 when createJob throws P2002 (race condition)', async () => {
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(true)
      const uniqueErr = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      })
      mockJobsService.createJob.mockRejectedValue(uniqueErr)

      const res = await request(app.getHttpServer()).post('/jobs/run-eligibility').expect(409)

      expect(res.body.message).toContain('RUN_ELIGIBILITY')
      expect(res.body.message).toContain('already running')
    })
  })

  describe('GET /jobs/:id', () => {
    it('should return job status from database only', async () => {
      const job = {
        id: 5,
        jobType: 'RUN_ELIGIBILITY',
        status: 'RUNNING',
        jobTrigger: 'END_USER',
        retryCount: 0,
        error: null,
        metadata: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        startedAt: new Date('2026-01-01T00:00:01Z'),
        completedAt: null,
      }
      mockJobsService.getJob.mockResolvedValue(job)

      const res = await request(app.getHttpServer()).get('/jobs/5').expect(200)

      expect(res.body.status).toBe('RUNNING')
      expect(mockJobsService.markFailed).not.toHaveBeenCalled()
    })

    it('should return 404 when job not found', async () => {
      mockJobsService.getJob.mockResolvedValue(null)

      await request(app.getHttpServer()).get('/jobs/999').expect(404)
    })
  })
})
