#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'
import { RetryModule } from '../retry.module'

// Marks stuck jobs as failed and retries all failed jobs
async function bootstrap() {
  const logger = new AppLogger('RetryFailedJob')

  try {
    logger.log('Bootstrapping retry failed jobs...')

    // Create NestJS application context (no HTTP server)
    const app = await NestFactory.createApplicationContext(RetryModule, {
      logger: customLogger,
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
    logger.alert(`Fatal bootstrap error: ${error.message}`, { stack: error.stack })
    process.exit(1)
  }
}

bootstrap()
