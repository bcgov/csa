import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'
import { JobStatus } from './enums/job-status.enum'
import { JobTrigger } from './enums/job-trigger.enum'
import { JobType } from './enums/job-type.enum'

export interface CreateJobDto {
  jobType: JobType
  jobTrigger: JobTrigger
  parentJobId?: number
  metadata?: Record<string, unknown>
}

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(dto: CreateJobDto) {
    const now = new Date()
    return this.prisma.jobRun.create({
      data: {
        jobType: dto.jobType,
        jobTrigger: dto.jobTrigger,
        parentJobId: dto.parentJobId,
        status: JobStatus.RUNNING,
        retryCount: 0,
        metadata: (dto.metadata ?? {}) as any,
        createdAt: now,
        startedAt: now,
      },
    })
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
        orderBy: { createdAt: 'desc' },
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
    return this.prisma.jobRun.update({
      where: { id },
      data: {
        status: JobStatus.SUCCESS,
        completedAt: new Date(),
        ...(metadata && { metadata: metadata as any }),
      },
    })
  }

  async markFailed(id: number, error: string) {
    return this.prisma.jobRun.update({
      where: { id },
      data: {
        status: JobStatus.FAILED,
        error,
        retryCount: { increment: 1 },
        completedAt: new Date(),
      },
    })
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

  async getFailedJobs() {
    return this.prisma.jobRun.findMany({
      where: {
        status: JobStatus.FAILED,
        parentJobId: null, // skip child jobs, parent will recreate them
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
      orderBy: {
        completedAt: 'asc',
      },
    })
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
    const threshold = new Date(Date.now() - stuckThresholdMinutes * 60 * 1000)
    return this.prisma.jobRun.updateMany({
      where: {
        status: JobStatus.RUNNING,
        startedAt: {
          lt: threshold,
        },
      },
      data: {
        status: JobStatus.FAILED,
        error: 'Job timed out (stuck)',
        completedAt: new Date(),
      },
    })
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
}
