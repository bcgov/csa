import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { JobStatus } from './enums/job-status.enum'
import { JobTrigger } from './enums/job-trigger.enum'
import { JobType } from './enums/job-type.enum'
import { JobResult } from './interfaces/job-result.interface'
import { Job } from './interfaces/job.interface'
import { JobRegistry } from './job-registry.service'
import { JobRunner } from './job-runner.service'
import { JobsService } from './jobs.service'

describe('JobRunner', () => {
  let runner: JobRunner
  let jobsService: JobsService
  let jobRegistry: JobRegistry

  const mockJobRun = {
    id: 1,
    jobType: JobType.INGEST_DATA,
    status: JobStatus.RUNNING,
    parentJobId: null,
    jobTrigger: JobTrigger.CRON,
    retryCount: 0,
    error: null,
    metadata: {},
    createdAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    childJobs: [],
    parentJob: null,
  }

  const mockHandler: Job = {
    jobType: JobType.INGEST_DATA,
    inlineRetryAttempts: 2,
    execute: vi.fn(),
    onStart: vi.fn(),
    onSuccess: vi.fn(),
    onFailure: vi.fn(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobRunner,
        {
          provide: JobsService,
          useValue: {
            createJob: vi.fn().mockResolvedValue(mockJobRun),
            getJob: vi.fn().mockResolvedValue(mockJobRun),
            markSuccess: vi.fn().mockResolvedValue(mockJobRun),
            markFailed: vi.fn().mockResolvedValue(mockJobRun),
            getFailedJobs: vi.fn().mockResolvedValue([]),
            markStuckJobsAsFailed: vi.fn().mockResolvedValue({ count: 0 }),
          },
        },
        {
          provide: JobRegistry,
          useValue: {
            getHandler: vi.fn().mockReturnValue(mockHandler),
            hasHandler: vi.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile()

    runner = module.get<JobRunner>(JobRunner)
    jobsService = module.get<JobsService>(JobsService)
    jobRegistry = module.get<JobRegistry>(JobRegistry)
  })

  it('should be defined', () => {
    expect(runner).toBeDefined()
  })

  describe('executeJob', () => {
    it('should execute job successfully', async () => {
      const successResult: JobResult = { success: true, message: 'Done' }
      vi.mocked(mockHandler.execute).mockResolvedValue(successResult)

      const result = await runner.executeJob(1)

      expect(jobsService.getJob).toHaveBeenCalledWith(1)
      expect(mockHandler.onStart).toHaveBeenCalled()
      expect(mockHandler.execute).toHaveBeenCalled()
      expect(jobsService.markSuccess).toHaveBeenCalledWith(1, undefined)
      expect(mockHandler.onSuccess).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should throw error if job not found', async () => {
      vi.mocked(jobsService.getJob).mockResolvedValue(null)

      await expect(runner.executeJob(999)).rejects.toThrow('Job 999 not found')
    })

    it('should mark as FAILED if no handler registered', async () => {
      vi.mocked(jobRegistry.getHandler).mockReturnValue(undefined)

      await expect(runner.executeJob(1)).rejects.toThrow('No handler registered')
      expect(jobsService.markFailed).toHaveBeenCalled()
    })

    it('should retry inline on failure and then mark as failed', async () => {
      vi.mocked(mockHandler.execute).mockRejectedValue(new Error('Connection failed'))

      const result = await runner.executeJob(1)

      // Should have tried inlineRetryAttempts + 1 times
      expect(mockHandler.execute).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
      expect(jobsService.markFailed).toHaveBeenCalled()
      expect(mockHandler.onFailure).toHaveBeenCalled()
      expect(result.success).toBe(false)
    })
  })

  describe('runJobType', () => {
    it('should create job and execute it', async () => {
      const successResult: JobResult = { success: true, message: 'Done' }
      vi.mocked(mockHandler.execute).mockResolvedValue(successResult)

      const result = await runner.runJobType(JobType.INGEST_DATA, JobTrigger.CRON)

      expect(jobsService.createJob).toHaveBeenCalledWith({
        jobType: JobType.INGEST_DATA,
        jobTrigger: JobTrigger.CRON,
        parentJobId: undefined,
        metadata: undefined,
      })
      expect(result.success).toBe(true)
    })

    it('should throw if no handler for job type', async () => {
      vi.mocked(jobRegistry.getHandler).mockReturnValue(undefined)

      await expect(runner.runJobType(JobType.SEND_CRA_FILE, JobTrigger.CRON)).rejects.toThrow(
        'No handler registered',
      )
    })

    it('should pass metadata to created job', async () => {
      const successResult: JobResult = { success: true }
      vi.mocked(mockHandler.execute).mockResolvedValue(successResult)
      const metadata = { batchId: 123 }

      await runner.runJobType(JobType.INGEST_DATA, JobTrigger.CRON, { metadata })

      expect(jobsService.createJob).toHaveBeenCalledWith(expect.objectContaining({ metadata }))
    })
  })

  describe('processFailedJobs', () => {
    it('should mark stuck jobs as failed and retry failed jobs', async () => {
      const failedJob = {
        id: 2,
        jobType: JobType.INGEST_DATA,
        jobTrigger: JobTrigger.CRON,
        retryCount: 1,
        metadata: {},
        parentJobId: null,
      }
      vi.mocked(jobsService.getFailedJobs).mockResolvedValue([failedJob])
      vi.mocked(jobsService.getJob).mockResolvedValue({ ...mockJobRun, id: 2 })
      vi.mocked(mockHandler.execute).mockResolvedValue({ success: true })

      await runner.processFailedJobs()

      expect(jobsService.markStuckJobsAsFailed).toHaveBeenCalledWith(60)
      expect(jobsService.getFailedJobs).toHaveBeenCalled()
      // Should create a new job for retry
      expect(jobsService.createJob).toHaveBeenCalled()
    })

    it('should handle errors during retry gracefully', async () => {
      const failedJob = {
        id: 2,
        jobType: JobType.INGEST_DATA,
        jobTrigger: JobTrigger.CRON,
        retryCount: 1,
        metadata: {},
        parentJobId: null,
      }
      vi.mocked(jobsService.getFailedJobs).mockResolvedValue([failedJob])
      vi.mocked(jobsService.createJob).mockRejectedValue(new Error('DB error'))

      // Should not throw
      await expect(runner.processFailedJobs()).resolves.toBeUndefined()
    })
  })
})
