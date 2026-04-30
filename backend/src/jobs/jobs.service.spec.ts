import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { PrismaService } from 'src/common/database/prisma.service'
import { JobStatus } from './enums/job-status.enum'
import { JobTrigger } from './enums/job-trigger.enum'
import { JobType } from './enums/job-type.enum'
import { JobsService } from './jobs.service'

describe('JobsService', () => {
  let service: JobsService
  let prisma: PrismaService

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
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: PrismaService,
          useValue: {
            jobRun: {
              create: vi.fn().mockResolvedValue(mockJobRun),
              findUnique: vi.fn().mockResolvedValue(mockJobRun),
              findFirst: vi.fn().mockResolvedValue(mockJobRun),
              findMany: vi.fn().mockResolvedValue([mockJobRun]),
              count: vi.fn().mockResolvedValue(1),
              update: vi.fn().mockResolvedValue(mockJobRun),
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
          },
        },
      ],
    }).compile()

    service = module.get<JobsService>(JobsService)
    prisma = module.get<PrismaService>(PrismaService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('createJob', () => {
    it('should create a job with RUNNING status', async () => {
      const result = await service.createJob({
        jobType: JobType.INGEST_DATA,
        jobTrigger: JobTrigger.CRON,
      })

      expect(prisma.jobRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobType: JobType.INGEST_DATA,
          jobTrigger: JobTrigger.CRON,
          status: JobStatus.RUNNING,
          retryCount: 0,
        }),
      })
      expect(result).toEqual(mockJobRun)
    })

    it('should create a child job with parent reference', async () => {
      await service.createJob({
        jobType: JobType.INGEST_ICM,
        jobTrigger: JobTrigger.CRON,
        parentJobId: 1,
      })

      expect(prisma.jobRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobType: JobType.INGEST_ICM,
          parentJobId: 1,
        }),
      })
    })
  })

  describe('getJob', () => {
    it('should query job by id', async () => {
      await service.getJob(1)

      expect(prisma.jobRun.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      })
    })
  })

  describe('getJobs', () => {
    it('should default to page=1, limit=20 and only return top-level jobs', async () => {
      const result = await service.getJobs({})

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
        where: { parentJobId: null },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      })
      expect(prisma.jobRun.count).toHaveBeenCalledWith({
        where: { parentJobId: null },
      })
      expect(result).toEqual({
        data: [mockJobRun],
        total: 1,
        page: 1,
        limit: 20,
      })
    })

    it('should compute skip/take from page and limit', async () => {
      await service.getJobs({ page: 3, limit: 25 })

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
        where: { parentJobId: null },
        orderBy: { createdAt: 'desc' },
        skip: 50,
        take: 25,
      })
    })

    it('should add jobType filter when provided', async () => {
      await service.getJobs({ jobType: JobType.RUN_ELIGIBILITY })

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
        where: { parentJobId: null, jobType: JobType.RUN_ELIGIBILITY },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      })
    })

    it('should add status filter when provided', async () => {
      await service.getJobs({ status: JobStatus.FAILED })

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
        where: { parentJobId: null, status: JobStatus.FAILED },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      })
    })

    it('should combine jobType, status, page, and limit filters', async () => {
      await service.getJobs({
        jobType: JobType.AUTO_BATCH,
        status: JobStatus.RUNNING,
        page: 2,
        limit: 10,
      })

      const expectedWhere = {
        parentJobId: null,
        jobType: JobType.AUTO_BATCH,
        status: JobStatus.RUNNING,
      }
      expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      })
      expect(prisma.jobRun.count).toHaveBeenCalledWith({ where: expectedWhere })
    })

    it('should run findMany and count in parallel against the same where clause', async () => {
      await service.getJobs({ jobType: JobType.AUTO_BATCH })

      const findManyArgs = (prisma.jobRun.findMany as any).mock.calls[0][0]
      const countArgs = (prisma.jobRun.count as any).mock.calls[0][0]
      expect(findManyArgs.where).toEqual(countArgs.where)
    })
  })

  describe('markSuccess', () => {
    it('should update status to SUCCESS with completedAt', async () => {
      await service.markSuccess(1)

      expect(prisma.jobRun.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: JobStatus.SUCCESS,
          completedAt: expect.any(Date),
        }),
      })
    })

    it('should update metadata if provided', async () => {
      await service.markSuccess(1, { recordsProcessed: 100 })

      expect(prisma.jobRun.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: JobStatus.SUCCESS,
          metadata: { recordsProcessed: 100 },
        }),
      })
    })
  })

  describe('markFailed', () => {
    it('should update status to FAILED with error and increment retry count', async () => {
      await service.markFailed(1, 'Connection timeout')

      expect(prisma.jobRun.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          error: 'Connection timeout',
          retryCount: { increment: 1 },
          completedAt: expect.any(Date),
        }),
      })
    })
  })

  describe('resetToRunning', () => {
    it('should reset a failed job to RUNNING with fresh startedAt', async () => {
      await service.resetToRunning(1)

      expect(prisma.jobRun.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          status: JobStatus.RUNNING,
          startedAt: expect.any(Date),
          completedAt: null,
          error: null,
        },
      })
    })
  })

  describe('getFailedJobs', () => {
    it('should return only top-level failed jobs (no child jobs)', async () => {
      await service.getFailedJobs()

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
        where: {
          status: JobStatus.FAILED,
          parentJobId: null,
          jobTrigger: JobTrigger.CRON,
        },
        select: {
          id: true,
          jobType: true,
          jobTrigger: true,
          retryCount: true,
          metadata: true,
          parentJobId: true,
        },
        orderBy: { completedAt: 'asc' },
      })
    })
  })

  describe('markStuckJobsAsFailed', () => {
    it('should mark stuck RUNNING jobs as FAILED', async () => {
      await service.markStuckJobsAsFailed(60)

      expect(prisma.jobRun.updateMany).toHaveBeenCalledWith({
        where: {
          status: JobStatus.RUNNING,
          startedAt: { lt: expect.any(Date) },
        },
        data: {
          status: JobStatus.FAILED,
          error: 'Job timed out (stuck)',
          completedAt: expect.any(Date),
        },
      })
    })
  })

  describe('getLastSuccessfulJob', () => {
    it('should return the most recent successful job of a type', async () => {
      await service.getLastSuccessfulJob(JobType.INGEST_DATA)

      expect(prisma.jobRun.findFirst).toHaveBeenCalledWith({
        where: {
          jobType: JobType.INGEST_DATA,
          status: JobStatus.SUCCESS,
        },
        orderBy: { completedAt: 'desc' },
      })
    })
  })

  describe('getLastSuccessTimestamp', () => {
    it('should return completed_at of last successful job of given type', async () => {
      const completedAt = new Date()
      vi.spyOn(prisma.jobRun, 'findFirst').mockResolvedValue({
        ...mockJobRun,
        completedAt,
      })

      const timestamp = await service.getLastSuccessTimestamp(JobType.INGEST_DATA)

      expect(timestamp).toEqual(completedAt)
    })

    it('should return null if no successful job exists', async () => {
      vi.spyOn(prisma.jobRun, 'findFirst').mockResolvedValue(null)

      const timestamp = await service.getLastSuccessTimestamp(JobType.INGEST_DATA)

      expect(timestamp).toBeNull()
    })
  })
})
