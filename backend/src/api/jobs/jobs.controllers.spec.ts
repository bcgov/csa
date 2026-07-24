import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'
import { JobRunner } from 'src/jobs/job-runner.service'
import { JobsService } from 'src/jobs/jobs.service'
import { OpenshiftJobLauncher } from 'src/jobs/openshift-job-launcher.service'
import request from 'supertest'
import { CSAGuard } from '../common/guards/csa.guard'
import { clearOpenshiftStatusCacheForTests } from './job-openshift-advisory'
import { JobsController } from './jobs.controller'

const mockCSAGuard = {
  canActivate: (context: { switchToHttp: () => { getRequest: () => any } }) => {
    const req = context.switchToHttp().getRequest()
    req.username = 'JSMITH'
    return true
  },
}

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
    getLatestJobsPerType: vi.fn(),
    getJobHistory: vi.fn(),
    getRecentActivities: vi.fn(),
    getActivities: vi.fn(),
    markFailed: vi.fn(),
  }

  const mockOpenshiftJobLauncher = {
    isEnabled: vi.fn().mockReturnValue(false),
    hasCronJobMapping: vi.fn().mockReturnValue(true),
    getJobStatus: vi.fn().mockResolvedValue({ state: 'ACTIVE', message: 'active' }),
    launchJob: vi.fn().mockResolvedValue({
      success: false,
      jobName: '',
      message: 'OpenShift disabled',
    }),
  }

  const mockConfigService = {
    get: vi.fn((key: string, defaultValue?: unknown) => {
      if (key === 'app.deployEnv') return 'local'
      return defaultValue
    }),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        { provide: ConfigService, useValue: mockConfigService },
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
    mockOpenshiftJobLauncher.isEnabled.mockReturnValue(false)
    mockOpenshiftJobLauncher.hasCronJobMapping.mockReturnValue(true)
    clearOpenshiftStatusCacheForTests()
  })

  afterEach(async () => {
    clearOpenshiftStatusCacheForTests()
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
        triggeredByUser: 'JSMITH',
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

    it('should run in API process when OpenShift is disabled and DEPLOY_ENV is local', async () => {
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(false)
      mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'app.deployEnv') return 'local'
        return defaultValue
      })
      mockJobsService.createJob.mockResolvedValue({ id: 501 })
      mockJobRunner.executeJob.mockResolvedValue({ success: true })

      const res = await request(app.getHttpServer()).post('/jobs/run-eligibility').expect(201)

      expect(res.body).toEqual({
        jobRunId: 501,
        message: 'Running RUN_ELIGIBILITY in API process (DEPLOY_ENV=local)',
      })
      expect(mockJobRunner.executeJob).toHaveBeenCalledWith(501)
      expect(mockOpenshiftJobLauncher.launchJob).not.toHaveBeenCalled()
    })

    it('should return 503 when OpenShift is disabled and DEPLOY_ENV is dev', async () => {
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(false)
      mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'app.deployEnv') return 'dev'
        return defaultValue
      })

      const res = await request(app.getHttpServer()).post('/jobs/run-eligibility').expect(503)

      expect(res.body.message).toContain('DEPLOY_ENV is dev')
      expect(mockJobsService.createJob).not.toHaveBeenCalled()
      expect(mockJobRunner.executeJob).not.toHaveBeenCalled()
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
    it('should sanitize stack trace errors for UI display', async () => {
      const job = {
        id: 5,
        jobType: 'AUTO_BATCH',
        status: 'FAILED',
        jobTrigger: 'END_USER',
        retryCount: 1,
        error: 'DriverAdapterError: [TEST] Forced AUTO_BATCH failure via DB trigger\n    at x.y.z',
        metadata: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        startedAt: new Date('2026-01-01T00:00:01Z'),
        completedAt: new Date('2026-01-01T00:00:05Z'),
      }
      mockJobsService.getJob.mockResolvedValue(job)

      const res = await request(app.getHttpServer()).get('/jobs/5').expect(200)

      expect(res.body.error).toBe(
        'AUTO_BATCH failed unexpectedly. Please retry. If it persists, contact support.',
      )
    })

    it('should return job status without warning when OpenShift is disabled', async () => {
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
      expect(res.body.warning).toBeUndefined()
      expect(mockJobsService.markFailed).not.toHaveBeenCalled()
      expect(mockOpenshiftJobLauncher.getJobStatus).not.toHaveBeenCalled()
    })

    it('should return a user-facing warning without mutating the job', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01T12:15:00Z'))

      const job = {
        id: 5,
        jobType: 'RUN_ELIGIBILITY',
        status: 'RUNNING',
        jobTrigger: 'END_USER',
        retryCount: 0,
        error: null,
        metadata: null,
        createdAt: new Date('2026-06-01T12:00:00Z'),
        startedAt: new Date('2026-06-01T12:00:01Z'),
        completedAt: null,
      }
      mockJobsService.getJob.mockResolvedValue(job)
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(true)
      mockOpenshiftJobLauncher.getJobStatus.mockResolvedValue({
        state: 'NOT_FOUND',
        message: 'OpenShift job csa-run-eligibility-5 not found',
      })

      const res = await request(app.getHttpServer()).get('/jobs/5').expect(200)

      expect(res.body.status).toBe('RUNNING')
      expect(res.body.warning).toContain('does not appear to be running')
      expect(res.body.warning).toContain('25 minutes')
      expect(mockJobsService.markFailed).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('should return 404 when job not found', async () => {
      mockJobsService.getJob.mockResolvedValue(null)

      await request(app.getHttpServer()).get('/jobs/999').expect(404)
    })
  })

  describe('POST /jobs/send-cra-file', () => {
    it('should create a job and return jobRunId when OpenShift is enabled', async () => {
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(true)
      mockOpenshiftJobLauncher.launchJob.mockResolvedValue({
        success: true,
        jobName: 'csa-run-cra-file-transfer-789',
        message: 'Job launched successfully',
      })
      mockJobsService.createJob.mockResolvedValue({ id: 789 })

      const res = await request(app.getHttpServer()).post('/jobs/send-cra-file').expect(201)

      expect(res.body).toEqual({
        jobRunId: 789,
        message: 'Job launched successfully',
        openshiftJobName: 'csa-run-cra-file-transfer-789',
      })
      expect(mockJobsService.createJob).toHaveBeenCalledWith({
        jobType: 'SEND_CRA_FILE',
        jobTrigger: 'END_USER',
        triggeredByUser: 'JSMITH',
      })
      expect(mockOpenshiftJobLauncher.launchJob).toHaveBeenCalledWith('SEND_CRA_FILE', 789)
    })

    it('should fail request and mark job as failed when launchJob fails', async () => {
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(true)
      mockOpenshiftJobLauncher.launchJob.mockResolvedValue({
        success: false,
        jobName: '',
        message: 'CronJob csa-run-cra-file-transfer not found',
      })
      mockJobsService.createJob.mockResolvedValue({ id: 456 })

      const res = await request(app.getHttpServer()).post('/jobs/send-cra-file').expect(503)

      expect(res.body.message).toBe('CronJob csa-run-cra-file-transfer not found')
      expect(mockJobsService.markFailed).toHaveBeenCalledWith(
        456,
        'CronJob csa-run-cra-file-transfer not found',
      )
    })

    it('should return 409 when createJob throws P2002 (race condition)', async () => {
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(true)
      const uniqueErr = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      })
      mockJobsService.createJob.mockRejectedValue(uniqueErr)

      const res = await request(app.getHttpServer()).post('/jobs/send-cra-file').expect(409)

      expect(res.body.message).toContain('SEND_CRA_FILE')
      expect(res.body.message).toContain('already running')
    })

    it('should run in API process when OpenShift is disabled and DEPLOY_ENV is local', async () => {
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(false)
      mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'app.deployEnv') return 'local'
        return defaultValue
      })
      mockJobsService.createJob.mockResolvedValue({ id: 555 })
      mockJobRunner.executeJob.mockResolvedValue({ success: true })

      const res = await request(app.getHttpServer()).post('/jobs/send-cra-file').expect(201)

      expect(res.body).toEqual({
        jobRunId: 555,
        message: 'Running SEND_CRA_FILE in API process (DEPLOY_ENV=local)',
      })
      expect(mockJobRunner.executeJob).toHaveBeenCalledWith(555)
      expect(mockOpenshiftJobLauncher.launchJob).not.toHaveBeenCalled()
    })

    it('should return 503 when OpenShift is disabled and DEPLOY_ENV is dev', async () => {
      mockOpenshiftJobLauncher.isEnabled.mockReturnValue(false)
      mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'app.deployEnv') return 'dev'
        return defaultValue
      })

      const res = await request(app.getHttpServer()).post('/jobs/send-cra-file').expect(503)

      expect(res.body.message).toContain('DEPLOY_ENV is dev')
      expect(mockJobsService.createJob).not.toHaveBeenCalled()
      expect(mockJobRunner.executeJob).not.toHaveBeenCalled()
    })
  })

  describe('GET /jobs/monitoring/latest', () => {
    it('should return latest monitored jobs with mapped display name and triggeredBy', async () => {
      const now = new Date('2026-07-01T12:00:00Z')
      mockJobsService.getLatestJobsPerType.mockResolvedValue([
        {
          id: 41,
          jobType: 'RUN_ELIGIBILITY',
          status: 'SUCCESS',
          jobTrigger: 'END_USER',
          triggeredByUser: 'JSMITH',
          startedAt: now,
          completedAt: now,
          metadata: { processed: 100, statusChanges: 2, newContacts: 1, skipped: 3 },
        },
      ])

      const res = await request(app.getHttpServer()).get('/jobs/monitoring/latest').expect(200)

      expect(res.body).toEqual([
        {
          id: 41,
          jobId: 41,
          jobName: 'Eligibility',
          status: 'Success',
          triggeredBy: 'JSMITH',
          started: now.toISOString(),
          finished: now.toISOString(),
          summary: '100 processed, 2 updated, 1 new, 3 skipped',
          warning: null,
        },
      ])
    })
  })

  describe('GET /jobs/monitoring/history', () => {
    it('should forward filters and return paginated mapped rows', async () => {
      const now = new Date('2026-07-02T10:00:00Z')
      mockJobsService.getJobHistory.mockResolvedValue({
        data: [
          {
            id: 7,
            jobType: 'SEND_CRA_FILE',
            status: 'FAILED',
            jobTrigger: 'CRON',
            startedAt: now,
            completedAt: now,
            metadata: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
      })

      const res = await request(app.getHttpServer())
        .get('/jobs/monitoring/history')
        .query({ status: 'FAILED', triggeredBy: 'SYSTEM', page: 1, limit: 10 })
        .expect(200)

      expect(mockJobsService.getJobHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'FAILED',
          triggeredBy: 'SYSTEM',
          page: 1,
          limit: 10,
        }),
      )
      expect(res.body.data[0]).toMatchObject({
        id: 7,
        jobName: 'Send CRA File',
        triggeredBy: 'SYSTEM',
        summary: 'Job failed',
      })
    })
  })

  describe('GET /jobs/monitoring/activities', () => {
    it('should return recent activities with pagination and filters', async () => {
      mockJobsService.getRecentActivities.mockResolvedValue({
        data: [
          { id: 1, jobRunId: 5, severity: 'WARNING', type: 'CRA', related: 'Invalid file format' },
        ],
        total: 1,
        page: 1,
        limit: 10,
      })

      const res = await request(app.getHttpServer())
        .get('/jobs/monitoring/activities')
        .query({ severity: 'WARNING', type: 'CRA', page: 1, limit: 10 })
        .expect(200)

      expect(mockJobsService.getRecentActivities).toHaveBeenCalledWith(1, 10, {
        severity: 'WARNING',
        type: 'CRA',
        sortBy: undefined,
        sortOrder: undefined,
      })
      expect(res.body.total).toBe(1)
    })
  })

  describe('GET /jobs/:id/activities', () => {
    it('should return activities for selected job run', async () => {
      mockJobsService.getActivities.mockResolvedValue({
        data: [{ id: 11, jobRunId: 99, severity: 'ERROR', type: 'JOB', related: 'boom' }],
        total: 1,
        page: 1,
        limit: 10,
      })

      const res = await request(app.getHttpServer())
        .get('/jobs/99/activities')
        .query({ page: 1, limit: 10, severity: 'ERROR', type: 'JOB' })
        .expect(200)

      expect(mockJobsService.getActivities).toHaveBeenCalledWith({
        jobRunId: 99,
        page: 1,
        limit: 10,
        severity: 'ERROR',
        type: 'JOB',
        sortBy: undefined,
        sortOrder: undefined,
      })
      expect(res.body.data[0].jobRunId).toBe(99)
    })
  })
})
