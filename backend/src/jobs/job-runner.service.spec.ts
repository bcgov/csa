import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'
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
    vi.resetAllMocks()

    // Stub sleep to avoid real delays in retry tests
    vi.spyOn(JobRunner.prototype as any, 'sleep').mockResolvedValue(undefined)

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
            resetToRunning: vi.fn().mockResolvedValue(mockJobRun),
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

    it('should persist stack trace to DB on failure', async () => {
      const error = new Error('Connection failed')
      vi.mocked(mockHandler.execute).mockRejectedValue(error)

      await runner.executeJob(1)

      // markFailed should receive the full stack, not just message
      const errorArg = vi.mocked(jobsService.markFailed).mock.calls[0][1]
      expect(errorArg).toContain('Connection failed')
      expect(errorArg).toContain('Error')
      // Stack traces include file paths
      expect(errorArg.length).toBeGreaterThan(error.message.length)
    })

    it('should handle onStart hook failure gracefully', async () => {
      vi.mocked(mockHandler.onStart).mockRejectedValue(new Error('onStart boom'))

      const result = await runner.executeJob(1)

      expect(result.success).toBe(false)
      expect(result.message).toContain('onStart failed')
      expect(jobsService.markFailed).toHaveBeenCalled()
      // execute should never be called if onStart fails
      expect(mockHandler.execute).not.toHaveBeenCalled()
    })

    it('should handle onSuccess hook error gracefully and still return success', async () => {
      const successResult: JobResult = { success: true, message: 'Done' }
      vi.mocked(mockHandler.execute).mockResolvedValue(successResult)
      vi.mocked(mockHandler.onSuccess).mockRejectedValue(new Error('onSuccess boom'))

      const result = await runner.executeJob(1)

      expect(result.success).toBe(true)
      expect(jobsService.markSuccess).toHaveBeenCalledWith(1, undefined)
      // Should not retry or mark as failed
      expect(mockHandler.execute).toHaveBeenCalledTimes(1)
      expect(jobsService.markFailed).not.toHaveBeenCalled()
    })

    it('should handle onFailure hook error without masking original error', async () => {
      vi.mocked(mockHandler.execute).mockRejectedValue(new Error('Original error'))
      vi.mocked(mockHandler.onFailure).mockRejectedValue(new Error('onFailure boom'))

      const result = await runner.executeJob(1)

      expect(result.success).toBe(false)
      // The original error message should be in the result, not the hook error
      expect(result.message).toContain('Original error')
      expect(jobsService.markFailed).toHaveBeenCalled()
    })

    it('should still log if markFailed DB call fails', async () => {
      vi.mocked(mockHandler.execute).mockRejectedValue(new Error('Job error'))
      vi.mocked(jobsService.markFailed).mockRejectedValue(new Error('DB down'))

      // Should not throw - safeMarkFailed catches DB errors
      const result = await runner.executeJob(1)
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

    it('should return failure when job of same type is already running', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      })
      vi.mocked(jobsService.createJob).mockRejectedValue(uniqueError)

      const result = await runner.runJobType(JobType.INGEST_DATA, JobTrigger.CRON)

      expect(result.success).toBe(false)
      expect(result.message).toContain('already running')
      expect(mockHandler.execute).not.toHaveBeenCalled()
    })

    it('should rethrow non-unique-constraint errors from createJob', async () => {
      vi.mocked(jobsService.createJob).mockRejectedValue(new Error('DB connection lost'))

      await expect(runner.runJobType(JobType.INGEST_DATA, JobTrigger.CRON)).rejects.toThrow(
        'DB connection lost',
      )
    })
  })

  describe('processFailedJobs', () => {
    it('should mark stuck jobs as failed and retry failed jobs in-place', async () => {
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
      // Should reset existing job to RUNNING (not create a new one)
      expect(jobsService.resetToRunning).toHaveBeenCalledWith(2)
      expect(jobsService.createJob).not.toHaveBeenCalled()
    })

    it('should skip retry when job of same type is already running (P2002)', async () => {
      const failedJob = {
        id: 2,
        jobType: JobType.INGEST_DATA,
        jobTrigger: JobTrigger.CRON,
        retryCount: 1,
        metadata: {},
        parentJobId: null,
      }
      vi.mocked(jobsService.getFailedJobs).mockResolvedValue([failedJob])
      vi.mocked(jobsService.resetToRunning).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.0.0',
        }),
      )

      await expect(runner.processFailedJobs()).resolves.toBeUndefined()
      expect(mockHandler.execute).not.toHaveBeenCalled()
    })

    it('should handle non-P2002 errors during retry gracefully', async () => {
      const failedJob = {
        id: 2,
        jobType: JobType.INGEST_DATA,
        jobTrigger: JobTrigger.CRON,
        retryCount: 1,
        metadata: {},
        parentJobId: null,
      }
      vi.mocked(jobsService.getFailedJobs).mockResolvedValue([failedJob])
      vi.mocked(jobsService.resetToRunning).mockRejectedValue(new Error('DB error'))

      // Should not throw
      await expect(runner.processFailedJobs()).resolves.toBeUndefined()
    })
  })
})
