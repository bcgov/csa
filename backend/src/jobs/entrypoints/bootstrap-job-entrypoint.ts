import type { Type } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'
import { parseJobRunIdFromArgv } from './job-entrypoint-args'

export interface BootstrapJobEntrypointOptions {
  loggerName: string
  module: Type
  jobType: JobType
  defaultTrigger: JobTrigger
}

/**
 * Standard job entrypoint bootstrap:
 * - With --job-run-id: execute an existing job_runs row (UI-triggered OpenShift Job)
 * - Without flag: create and run via runJobType (cron, oc create, local npm)
 */
export async function bootstrapJobEntrypoint(
  options: BootstrapJobEntrypointOptions,
): Promise<void> {
  const logger = new AppLogger(options.loggerName)

  try {
    const jobRunId = parseJobRunIdFromArgv()

    if (jobRunId !== undefined) {
      logger.log(`Bootstrapping ${options.jobType} for job_run ${jobRunId}...`)
    } else {
      logger.log(`Bootstrapping ${options.jobType} (standalone mode)...`)
    }

    const app = await NestFactory.createApplicationContext(options.module, {
      logger: customLogger,
    })

    const jobRunner = app.get(JobRunner)

    const result =
      jobRunId !== undefined
        ? await jobRunner.executeJob(jobRunId)
        : await jobRunner.runJobType(options.jobType, options.defaultTrigger)

    await app.close()

    if (result.success) {
      logger.log(`${options.jobType} completed successfully`)
      process.exit(0)
    }

    logger.error(`${options.jobType} failed: ${result.message}`)
    process.exit(1)
  } catch (error) {
    const err = error as Error
    logger.alert(`Fatal bootstrap error: ${err.message}`, { stack: err.stack })
    process.exit(1)
  }
}
