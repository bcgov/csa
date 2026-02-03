#!/usr/bin/env node
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { CraModule } from 'src/cra/cra.module'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// Polls for and processes CRA response files
async function bootstrap() {
  const logger = new Logger('CRAResponsePollJob')

  try {
    logger.log('Bootstrapping CRA response poll job...')

    // Create NestJS application context (no HTTP server)
    const app = await NestFactory.createApplicationContext(CraModule, {
      logger: ['log', 'error', 'warn'],
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
      // process.exit(1)
    }
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`, error.stack)
    // process.exit(1)
  }
}

bootstrap()
