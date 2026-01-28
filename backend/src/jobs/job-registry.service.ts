import { Injectable, Logger } from '@nestjs/common'
import { JobType } from './enums/job-type.enum'
import { Job } from './interfaces/job.interface'

@Injectable()
export class JobRegistry {
  private readonly logger = new Logger(JobRegistry.name)
  private readonly handlers = new Map<JobType, Job>()

  register(jobType: JobType, handler: Job): void {
    this.handlers.set(jobType, handler)
    this.logger.log(`Registered handler for ${jobType}`)
  }

  getHandler(jobType: JobType): Job | undefined {
    return this.handlers.get(jobType)
  }

  hasHandler(jobType: JobType): boolean {
    return this.handlers.has(jobType)
  }

  getRegisteredTypes(): JobType[] {
    return Array.from(this.handlers.keys())
  }
}
