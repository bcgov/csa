#!/usr/bin/env node
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'
import { JobsModule } from '../jobs.module'

// Marks stuck jobs as failed and retries all failed jobs
async function bootstrap() {
  const logger = new Logger('RetryFailedJob')

  try {
    logger.log('Bootstrapping retry failed jobs...')

    // Create NestJS application context (no HTTP server)
    const app = await NestFactory.createApplicationContext(JobsModule, {
      logger: ['log', 'error', 'warn'],
    })

    // Get JobRunner from DI container
    const jobRunner = app.get(JobRunner)

    // Run RETRY_FAILED job
    const result = await jobRunner.runJobType(JobType.RETRY_FAILED, JobTrigger.CRON)

    await app.close()

    if (result.success) {
      logger.log('Retry failed jobs completed successfully')
      process.exit(0)
    } else {
      logger.error(`Retry failed jobs failed: ${result.message}`)
      process.exit(1)
    }
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`, error.stack)
    process.exit(1)
  }
}

bootstrap()
