#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { CraModule } from 'src/cra/cra.module'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// Polls for and processes CRA response files
async function bootstrap() {
  const logger = new AppLogger('CRAResponsePollJob')

  try {
    logger.log('Bootstrapping CRA response poll job...')

    // Create NestJS application context (no HTTP server)
    const app = await NestFactory.createApplicationContext(CraModule, {
      logger: customLogger,
    })

    // Get JobRunner from DI container
    const jobRunner = app.get(JobRunner)

    // Run POLL_CRA_RESPONSE job
    const result = await jobRunner.runJobType(JobType.POLL_CRA_RESPONSE, JobTrigger.CRON)

    await app.close()

    if (result.success) {
      logger.log('CRA response poll completed successfully')
      process.exit(0)
    } else {
      logger.error(`CRA response poll failed: ${result.message}`)
      process.exit(1)
    }
  } catch (error) {
    logger.alert(`Fatal bootstrap error: ${error.message}`, { stack: error.stack })
    process.exit(1)
  }
}

bootstrap()
