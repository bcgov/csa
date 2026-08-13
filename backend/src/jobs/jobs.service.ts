import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/common/database/prisma.service'
import { buildStableOrderBy } from 'src/common/utils'
import { JobActivitySeverity } from './enums/job-activity-severity.enum'
import { JobActivityType } from './enums/job-activity-type.enum'
import { JobStatus } from './enums/job-status.enum'
import { JobTrigger } from './enums/job-trigger.enum'
import { JobType } from './enums/job-type.enum'
import {
  formatTriggeredBy,
  isMonitoredChildJobType,
  MONITORED_CHILD_JOB_TYPES,
  MONITORED_JOB_HISTORY_TYPES,
  MONITORED_JOB_LIST_TYPES,
} from './job-monitoring.utils'

const RETRYABLE_END_USER_JOB_TYPES: JobType[] = [JobType.SEND_CRA_FILE]

/** Top-level failed jobs that retry-failed may re-run (excludes RETRY_FAILED to avoid recursion). */
const RETRYABLE_FAILED_JOB_WHERE = {
  status: JobStatus.FAILED,
  parentJobId: null,
  jobType: { not: JobType.RETRY_FAILED },
  OR: [
    { jobTrigger: JobTrigger.CRON },
    {
      jobTrigger: JobTrigger.END_USER,
      jobType: { in: RETRYABLE_END_USER_JOB_TYPES },
    },
  ],
} satisfies Prisma.JobRunWhereInput

export interface MonitoringHistoryFilters {
  page?: number
  limit?: number
  jobType?: JobType
  status?: JobStatus
  triggeredBy?: string
  jobId?: number
  sortBy?: 'id' | 'jobType' | 'status' | 'jobTrigger' | 'startedAt' | 'completedAt' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

export interface MonitoringActivityFilters {
  page?: number
  limit?: number
  jobRunId?: number
  severity?: JobActivitySeverity
  type?: JobActivityType
  sortBy?: 'when' | 'severity' | 'type' | 'jobRunId'
  sortOrder?: 'asc' | 'desc'
  fromWhen?: Date
}

export interface CreateJobDto {
  jobType: JobType
  jobTrigger: JobTrigger
  parentJobId?: number
  triggeredByUser?: string
  metadata?: Record<string, unknown>
}

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  private getMonitoringHistoryScopeWhere(
    filters: Pick<MonitoringHistoryFilters, 'jobType' | 'status' | 'jobId' | 'triggeredBy'> = {},
  ): Prisma.JobRunWhereInput {
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

    const monitoredTypes = filters.jobType ? [filters.jobType] : MONITORED_JOB_HISTORY_TYPES

    const where: Prisma.JobRunWhereInput = {
      startedAt: { gte: oneMonthAgo },
      jobType: { in: monitoredTypes },
      OR: [{ jobType: { in: MONITORED_CHILD_JOB_TYPES } }, { parentJobId: null }],
      ...(filters.status && { status: filters.status }),
      ...(filters.jobId && { id: filters.jobId }),
    }

    if (filters.triggeredBy) {
      if (filters.triggeredBy === 'SYSTEM') {
        where.jobTrigger = { in: [JobTrigger.CRON, JobTrigger.SYSTEM] }
      } else if (filters.triggeredBy === JobTrigger.END_USER) {
        where.jobTrigger = JobTrigger.END_USER
      } else if (
        filters.triggeredBy === JobTrigger.CRON ||
        filters.triggeredBy === JobTrigger.SYSTEM
      ) {
        where.jobTrigger = filters.triggeredBy
      } else {
        where.jobTrigger = JobTrigger.END_USER
        where.triggeredByUser = { equals: filters.triggeredBy, mode: 'insensitive' }
      }
    }

    return where
  }

  async createJob(dto: CreateJobDto) {
    const now = new Date()
    const job = await this.prisma.jobRun.create({
      data: {
        jobType: dto.jobType,
        jobTrigger: dto.jobTrigger,
        parentJobId: dto.parentJobId,
        triggeredByUser: dto.triggeredByUser,
        status: JobStatus.RUNNING,
        retryCount: 0,
        metadata: (dto.metadata ?? {}) as any,
        createdAt: now,
        startedAt: now,
      },
    })

    return job
  }

  async getJobs(filters: { jobType?: JobType; status?: JobStatus; page?: number; limit?: number }) {
    const page = filters.page ?? 1
    const limit = filters.limit ?? 20
    const where = {
      parentJobId: null, // top-level jobs only
      ...(filters.jobType && { jobType: filters.jobType }),
      ...(filters.status && { status: filters.status }),
    }

    const [data, total] = await Promise.all([
      this.prisma.jobRun.findMany({
        where,
        orderBy: buildStableOrderBy({ createdAt: 'desc' }),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.jobRun.count({ where }),
    ])

    return { data, total, page, limit }
  }

  async getJob(id: number) {
    return this.prisma.jobRun.findUnique({
      where: { id },
    })
  }

  async markSuccess(id: number, metadata?: Record<string, unknown>) {
    const result = await this.prisma.jobRun.updateMany({
      where: { id, status: JobStatus.RUNNING },
      data: {
        status: JobStatus.SUCCESS,
        completedAt: new Date(),
        ...(metadata && { metadata: metadata as any }),
      },
    })

    return result
  }

  async markFailed(id: number, error: string) {
    const result = await this.prisma.jobRun.updateMany({
      where: { id, status: JobStatus.RUNNING },
      data: {
        status: JobStatus.FAILED,
        error,
        retryCount: { increment: 1 },
        completedAt: new Date(),
      },
    })

    if (result.count > 0) {
      await this.addActivity(id, {
        severity: JobActivitySeverity.ERROR,
        type: JobActivityType.JOB,
        related: error.slice(0, 512),
      })
    }

    return result
  }

  async resetToRunning(id: number) {
    return this.prisma.jobRun.update({
      where: { id },
      data: {
        status: JobStatus.RUNNING,
        startedAt: new Date(),
        completedAt: null,
        error: null,
      },
    })
  }

  /** Cron failures superseded by a later success are not worth retrying. */
  private async isCronFailureStillActionable(job: {
    jobType: string
    completedAt: Date | null
  }): Promise<boolean> {
    if (!job.completedAt) {
      return true
    }
    const lastSuccess = await this.getLastSuccessTimestamp(job.jobType as JobType)
    return lastSuccess === null || job.completedAt > lastSuccess
  }

  async getFailedJobs() {
    const failed = await this.prisma.jobRun.findMany({
      where: RETRYABLE_FAILED_JOB_WHERE,
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

    // One retry per job type — latest failure only (avoids replaying historical backlog).
    const latestByType = new Map<string, (typeof failed)[number]>()
    for (const job of failed) {
      if (!latestByType.has(job.jobType)) {
        latestByType.set(job.jobType, job)
      }
    }

    const actionable: (typeof failed)[number][] = []
    for (const job of latestByType.values()) {
      if (job.jobTrigger !== JobTrigger.CRON || (await this.isCronFailureStillActionable(job))) {
        actionable.push(job)
      }
    }

    return actionable.sort(
      (a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0),
    )
  }

  //TODO: define when a job is stuck
  //stuckThresholdMinutes
  async getStuckRunningJobs(stuckThresholdMinutes: number = 60) {
    const threshold = new Date(Date.now() - stuckThresholdMinutes * 60 * 1000)
    return this.prisma.jobRun.findMany({
      where: {
        status: JobStatus.RUNNING,
        startedAt: {
          lt: threshold,
        },
      },
    })
  }

  async markStuckJobsAsFailed(stuckThresholdMinutes: number = 60) {
    const stuckJobs = await this.getStuckRunningJobs(stuckThresholdMinutes)
    const result = await this.prisma.jobRun.updateMany({
      where: {
        status: JobStatus.RUNNING,
        startedAt: {
          lt: new Date(Date.now() - stuckThresholdMinutes * 60 * 1000),
        },
      },
      data: {
        status: JobStatus.FAILED,
        error: 'Job timed out (stuck)',
        completedAt: new Date(),
      },
    })

    if (result.count > 0) {
      for (const job of stuckJobs) {
        await this.addActivity(job.id, {
          severity: JobActivitySeverity.WARNING,
          type: JobActivityType.JOB,
          related: 'Job timed out (stuck)',
        })
      }
    }

    return result
  }

  async markStuckJobAsFailed(id: number, error: string = 'Job timed out (stuck)') {
    const result = await this.prisma.jobRun.updateMany({
      where: { id, status: JobStatus.RUNNING },
      data: {
        status: JobStatus.FAILED,
        error,
        completedAt: new Date(),
      },
    })

    if (result.count > 0) {
      await this.addActivity(id, {
        severity: JobActivitySeverity.WARNING,
        type: JobActivityType.JOB,
        related: error.slice(0, 512),
      })
    }

    return result
  }

  async getChildJobs(parentJobId: number) {
    return this.prisma.jobRun.findMany({
      where: { parentJobId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async getLastSuccessfulJob(jobType: JobType) {
    return this.prisma.jobRun.findFirst({
      where: {
        jobType,
        status: JobStatus.SUCCESS,
      },
      orderBy: {
        completedAt: 'desc',
      },
    })
  }

  // Get the completion timestamp of the last successful job of a given type
  async getLastSuccessTimestamp(jobType: JobType): Promise<Date | null> {
    const lastJob = await this.getLastSuccessfulJob(jobType)
    return lastJob?.completedAt ?? null
  }

  async hasStuckOrFailedJobs(stuckThresholdMinutes: number = 40): Promise<boolean> {
    const threshold = new Date(Date.now() - stuckThresholdMinutes * 60 * 1000)

    const stuck = await this.prisma.jobRun.findFirst({
      where: { status: JobStatus.RUNNING, startedAt: { lt: threshold } },
      select: { id: true },
    })
    if (stuck) return true

    return (await this.getFailedJobs()).length > 0
  }

  async getLatestJobsPerType() {
    const runs = await Promise.all(
      MONITORED_JOB_LIST_TYPES.map((jobType) =>
        this.prisma.jobRun.findFirst({
          where: {
            jobType,
            ...(isMonitoredChildJobType(jobType) ? {} : { parentJobId: null }),
          },
          orderBy: { startedAt: 'desc' },
        }),
      ),
    )

    return runs.filter((run): run is NonNullable<typeof run> => run !== null)
  }

  async getJobHistory(filters: MonitoringHistoryFilters = {}) {
    const page = filters.page ?? 1
    const limit = filters.limit ?? 10
    const where = this.getMonitoringHistoryScopeWhere(filters)

    const sortBy = filters.sortBy ?? 'startedAt'
    const sortOrder = filters.sortOrder ?? 'desc'

    const [data, total] = await Promise.all([
      this.prisma.jobRun.findMany({
        where,
        orderBy: buildStableOrderBy({ [sortBy]: sortOrder }),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.jobRun.count({ where }),
    ])

    return { data, total, page, limit }
  }

  async getMonitoringTriggeredByValues(): Promise<string[]> {
    const rows = await this.prisma.jobRun.findMany({
      where: this.getMonitoringHistoryScopeWhere(),
      select: {
        jobTrigger: true,
        triggeredByUser: true,
      },
      distinct: ['jobTrigger', 'triggeredByUser'],
    })

    const values = Array.from(
      new Set(
        rows
          .map((row) => formatTriggeredBy(row))
          .map((value) => value.trim().toUpperCase())
          .filter((value) => value.length > 0),
      ),
    )

    const sortedIdirs = values
      .filter((value) => value !== 'SYSTEM')
      .sort((a, b) => a.localeCompare(b))
    return values.includes('SYSTEM') ? ['SYSTEM', ...sortedIdirs] : sortedIdirs
  }

  async addActivity(
    jobRunId: number | null,
    activity: { severity: JobActivitySeverity; type: JobActivityType; related?: string },
  ) {
    return this.prisma.jobActivity.create({
      data: {
        jobRunId,
        severity: activity.severity,
        type: activity.type,
        related: activity.related,
        when: new Date(),
      },
    })
  }

  async getActivities(filters: MonitoringActivityFilters = {}) {
    const page = filters.page ?? 1
    const limit = filters.limit ?? 10
    const sortBy = filters.sortBy ?? 'when'
    const sortOrder = filters.sortOrder ?? 'desc'

    const where = {
      ...(filters.jobRunId && { jobRunId: filters.jobRunId }),
      ...(filters.severity && { severity: filters.severity }),
      ...(filters.type && { type: filters.type }),
      ...(filters.fromWhen && { when: { gte: filters.fromWhen } }),
    }

    const [data, total] = await Promise.all([
      this.prisma.jobActivity.findMany({
        where,
        orderBy: buildStableOrderBy({ [sortBy]: sortOrder }),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.jobActivity.count({ where }),
    ])

    return { data, total, page, limit }
  }

  async getRecentActivities(
    page: number = 1,
    limit: number = 10,
    filters: Omit<MonitoringActivityFilters, 'page' | 'limit' | 'jobRunId' | 'fromWhen'> = {},
  ) {
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

    return this.getActivities({
      page,
      limit,
      severity: filters.severity,
      type: filters.type,
      sortBy: filters.sortBy ?? 'when',
      sortOrder: filters.sortOrder ?? 'desc',
      fromWhen: oneMonthAgo,
    })
  }
}
