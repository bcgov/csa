#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { SyncModule } from 'src/sync/sync.module'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// Runs eligibility rules against staged data
async function bootstrap() {
  const logger = new AppLogger('RunEligibilityJob')

  try {
    logger.log('Bootstrapping eligibility job...')

    const app = await NestFactory.createApplicationContext(SyncModule, {
      logger: customLogger,
    })

    const jobRunner = app.get(JobRunner)
    const result = await jobRunner.runJobType(JobType.RUN_ELIGIBILITY, JobTrigger.END_USER)

    await app.close()

    if (result.success) {
      logger.log('Eligibility processing completed successfully')
      process.exit(0)
    } else {
      logger.error(`Eligibility processing failed: ${result.message}`)
      process.exit(1)
    }
  } catch (error) {
    logger.alert(`Fatal bootstrap error: ${error.message}`, { stack: error.stack })
    process.exit(1)
  }
}

bootstrap()
