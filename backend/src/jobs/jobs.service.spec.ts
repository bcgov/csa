import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { PrismaService } from 'src/common/database/prisma.service'
import { JobActivitySeverity } from './enums/job-activity-severity.enum'
import { JobActivityType } from './enums/job-activity-type.enum'
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
            jobActivity: {
              create: vi.fn().mockResolvedValue({ id: 1 }),
              findMany: vi.fn().mockResolvedValue([{ id: 1 }]),
              count: vi.fn().mockResolvedValue(1),
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
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
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
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 50,
        take: 25,
      })
    })

    it('should add jobType filter when provided', async () => {
      await service.getJobs({ jobType: JobType.RUN_ELIGIBILITY })

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
        where: { parentJobId: null, jobType: JobType.RUN_ELIGIBILITY },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 0,
        take: 20,
      })
    })

    it('should add status filter when provided', async () => {
      await service.getJobs({ status: JobStatus.FAILED })

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
        where: { parentJobId: null, status: JobStatus.FAILED },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
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
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
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

      expect(prisma.jobRun.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: JobStatus.RUNNING },
        data: expect.objectContaining({
          status: JobStatus.SUCCESS,
          completedAt: expect.any(Date),
        }),
      })
    })

    it('should update metadata if provided', async () => {
      await service.markSuccess(1, { recordsProcessed: 100 })

      expect(prisma.jobRun.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: JobStatus.RUNNING },
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

      expect(prisma.jobRun.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: JobStatus.RUNNING },
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          error: 'Connection timeout',
          retryCount: { increment: 1 },
          completedAt: expect.any(Date),
        }),
      })
      expect(prisma.jobActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobRunId: 1,
          severity: JobActivitySeverity.ERROR,
          type: JobActivityType.JOB,
          related: 'Connection timeout',
        }),
      })
    })
  })

  describe('monitoring', () => {
    it('should return latest run per monitored job type', async () => {
      const latestIcm = {
        ...mockJobRun,
        id: 3,
        jobType: JobType.INGEST_ICM,
        parentJobId: 99,
        startedAt: new Date('2026-01-02T00:00:00Z'),
      }
      const latestEligibility = {
        ...mockJobRun,
        id: 4,
        jobType: JobType.RUN_ELIGIBILITY,
        parentJobId: null,
      }
      vi.spyOn(prisma.jobRun, 'findFirst')
        .mockResolvedValueOnce(latestIcm as any)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(latestEligibility as any)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)

      const result = await service.getLatestJobsPerType()

      expect(result).toHaveLength(2)
      expect(result.find((x) => x.jobType === JobType.INGEST_ICM)?.id).toBe(3)
      expect(prisma.jobRun.findFirst).toHaveBeenCalledWith({
        where: { jobType: JobType.INGEST_ICM },
        orderBy: { startedAt: 'desc' },
      })
      expect(prisma.jobRun.findFirst).toHaveBeenCalledWith({
        where: { jobType: JobType.RUN_ELIGIBILITY, parentJobId: null },
        orderBy: { startedAt: 'desc' },
      })
    })

    it('should store triggeredByUser when provided', async () => {
      await service.createJob({
        jobType: JobType.RUN_ELIGIBILITY,
        jobTrigger: JobTrigger.END_USER,
        triggeredByUser: 'JSMITH',
      })

      expect(prisma.jobRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          triggeredByUser: 'JSMITH',
        }),
      })
    })

    it('should filter monitoring history by SYSTEM using jobTrigger', async () => {
      await service.getJobHistory({ triggeredBy: 'SYSTEM' })

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            jobTrigger: { in: [JobTrigger.CRON, JobTrigger.SYSTEM] },
          }),
        }),
      )
    })

    it('should query history for monitored types including ICM/MIS child runs', async () => {
      await service.getJobHistory()

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startedAt: { gte: expect.any(Date) },
            OR: [
              { jobType: { in: [JobType.INGEST_ICM, JobType.INGEST_MIS] } },
              { parentJobId: null },
            ],
          }),
          orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
        }),
      )
    })

    it('should filter monitoring history by user IDIR', async () => {
      await service.getJobHistory({ triggeredBy: 'jsmith' })

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            jobTrigger: JobTrigger.END_USER,
            triggeredByUser: { equals: 'jsmith', mode: 'insensitive' },
          }),
        }),
      )
    })

    it('should return distinct trigger values for full monitoring scope', async () => {
      vi.spyOn(prisma.jobRun, 'findMany').mockResolvedValue([
        { jobTrigger: JobTrigger.CRON, triggeredByUser: null },
        { jobTrigger: JobTrigger.END_USER, triggeredByUser: 'jsmith' },
        { jobTrigger: JobTrigger.END_USER, triggeredByUser: 'adoe' },
        { jobTrigger: JobTrigger.END_USER, triggeredByUser: 'JSMITH' },
      ] as any)

      const result = await service.getMonitoringTriggeredByValues()

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startedAt: { gte: expect.any(Date) },
          }),
          select: {
            jobTrigger: true,
            triggeredByUser: true,
          },
          distinct: ['jobTrigger', 'triggeredByUser'],
        }),
      )
      expect(result).toEqual(['SYSTEM', 'ADOE', 'JSMITH'])
    })

    it('should apply recent activity time window', async () => {
      await service.getRecentActivities(1, 10)

      expect(prisma.jobActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            when: { gte: expect.any(Date) },
          }),
        }),
      )
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
    it('should query retryable failed jobs ordered by latest completion first', async () => {
      await service.getFailedJobs()

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
        where: {
          status: JobStatus.FAILED,
          parentJobId: null,
          jobType: { not: JobType.RETRY_FAILED },
          OR: [
            { jobTrigger: JobTrigger.CRON },
            {
              jobTrigger: JobTrigger.END_USER,
              jobType: { in: [JobType.SEND_CRA_FILE] },
            },
          ],
        },
        select: {
          id: true,
          jobType: true,
          jobTrigger: true,
          retryCount: true,
          metadata: true,
          parentJobId: true,
          completedAt: true,
        },
        orderBy: { completedAt: 'desc' },
      })
    })

    it('should return only the latest failed job per job type', async () => {
      vi.mocked(prisma.jobRun.findMany).mockResolvedValue([
        {
          id: 3,
          jobType: JobType.INGEST_DATA,
          jobTrigger: JobTrigger.CRON,
          retryCount: 2,
          metadata: {},
          parentJobId: null,
          completedAt: new Date('2026-07-07T20:00:00Z'),
        },
        {
          id: 2,
          jobType: JobType.INGEST_DATA,
          jobTrigger: JobTrigger.CRON,
          retryCount: 10,
          metadata: {},
          parentJobId: null,
          completedAt: new Date('2026-07-01T10:00:00Z'),
        },
        {
          id: 5,
          jobType: JobType.RUN_ELIGIBILITY,
          jobTrigger: JobTrigger.CRON,
          retryCount: 1,
          metadata: {},
          parentJobId: null,
          completedAt: new Date('2026-07-06T12:00:00Z'),
        },
      ] as any)

      const result = await service.getFailedJobs()

      expect(result).toHaveLength(2)
      expect(result.map((j) => j.id)).toEqual([5, 3])
    })

    it('should skip cron failures that are older than the last success for that type', async () => {
      vi.mocked(prisma.jobRun.findMany).mockResolvedValue([
        {
          id: 1,
          jobType: JobType.INGEST_DATA,
          jobTrigger: JobTrigger.CRON,
          retryCount: 1,
          metadata: {},
          parentJobId: null,
          completedAt: new Date('2026-07-01T10:00:00Z'),
        },
      ] as any)
      vi.mocked(prisma.jobRun.findFirst).mockResolvedValue({
        completedAt: new Date('2026-07-05T12:00:00Z'),
      } as any)

      const result = await service.getFailedJobs()

      expect(result).toEqual([])
    })

    it('should still retry end-user failures even when a later success exists for that type', async () => {
      vi.mocked(prisma.jobRun.findMany).mockResolvedValue([
        {
          id: 10,
          jobType: JobType.SEND_CRA_FILE,
          jobTrigger: JobTrigger.END_USER,
          retryCount: 1,
          metadata: {},
          parentJobId: null,
          completedAt: new Date('2026-07-01T10:00:00Z'),
        },
      ] as any)

      const result = await service.getFailedJobs()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(10)
      expect(prisma.jobRun.findFirst).not.toHaveBeenCalled()
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

  describe('hasStuckOrFailedJobs', () => {
    it('should return true when a stuck RUNNING job exists', async () => {
      vi.spyOn(prisma.jobRun, 'findFirst').mockResolvedValueOnce({ id: 99 } as any)

      const result = await service.hasStuckOrFailedJobs()

      expect(result).toBe(true)
      expect(prisma.jobRun.findFirst).toHaveBeenCalledWith({
        where: { status: JobStatus.RUNNING, startedAt: { lt: expect.any(Date) } },
        select: { id: true },
      })
    })

    it('should return true when an actionable failed job exists', async () => {
      vi.spyOn(prisma.jobRun, 'findFirst').mockResolvedValueOnce(null) // no stuck jobs
      vi.spyOn(service, 'getFailedJobs').mockResolvedValueOnce([
        {
          id: 50,
          jobType: JobType.INGEST_DATA,
          jobTrigger: JobTrigger.CRON,
          retryCount: 1,
          metadata: {},
          parentJobId: null,
          completedAt: new Date(),
        },
      ])

      const result = await service.hasStuckOrFailedJobs()

      expect(result).toBe(true)
    })

    it('should return false when only stale cron failures exist', async () => {
      vi.spyOn(prisma.jobRun, 'findFirst').mockResolvedValueOnce(null) // no stuck jobs
      vi.spyOn(service, 'getFailedJobs').mockResolvedValueOnce([])

      const result = await service.hasStuckOrFailedJobs()

      expect(result).toBe(false)
    })

    it('should return false when no stuck or failed jobs exist', async () => {
      vi.spyOn(prisma.jobRun, 'findFirst').mockResolvedValueOnce(null) // no stuck jobs
      vi.spyOn(service, 'getFailedJobs').mockResolvedValueOnce([])

      const result = await service.hasStuckOrFailedJobs()

      expect(result).toBe(false)
    })

    it('should use the default 40-minute threshold', async () => {
      vi.spyOn(prisma.jobRun, 'findFirst').mockResolvedValueOnce(null)
      vi.spyOn(service, 'getFailedJobs').mockResolvedValueOnce([])
      const before = new Date(Date.now() - 40 * 60 * 1000)

      await service.hasStuckOrFailedJobs()

      const calledThreshold = (prisma.jobRun.findFirst as any).mock.calls[0][0].where.startedAt.lt
      // threshold should be ~40 min ago (within 1 second tolerance)
      expect(calledThreshold.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
      expect(calledThreshold.getTime()).toBeLessThanOrEqual(before.getTime() + 1000)
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
