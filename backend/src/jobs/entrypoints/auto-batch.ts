#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { SyncModule } from 'src/sync/sync.module'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// Adds all eligible and not_eligible_in_pay contacts to the pending batch
async function bootstrap() {
  const logger = new AppLogger('AutoBatchJob')

  try {
    // Support both modes: JOB_RUN_ID from OpenShift or standalone execution
    const jobRunId = process.env.JOB_RUN_ID

    if (jobRunId) {
      logger.log(`Bootstrapping auto-batch job for job_run ${jobRunId}...`)
    } else {
      logger.log('Bootstrapping auto-batch job (standalone mode)...')
    }

    const app = await NestFactory.createApplicationContext(SyncModule, {
      logger: customLogger,
    })

    const jobRunner = app.get(JobRunner)

    let result
    if (jobRunId) {
      // Execute specific job_run created by API
      const parsedId = parseInt(jobRunId, 10)
      if (isNaN(parsedId) || parsedId <= 0) {
        throw new Error(`Invalid JOB_RUN_ID: ${jobRunId}. Must be a positive integer.`)
      }
      result = await jobRunner.executeJob(parsedId)
    } else {
      // Fallback: create and run job (for manual CLI execution)
      result = await jobRunner.runJobType(JobType.AUTO_BATCH, JobTrigger.CRON)
    }

    await app.close()

    if (result.success) {
      logger.log(`Auto-batch completed: ${result.message}`)
      process.exit(0)
    } else {
      logger.error(`Auto-batch failed: ${result.message}`)
      process.exit(1)
    }
  } catch (error) {
    logger.alert(`Fatal bootstrap error: ${error.message}`, { stack: error.stack })
    process.exit(1)
  }
}

bootstrap()
