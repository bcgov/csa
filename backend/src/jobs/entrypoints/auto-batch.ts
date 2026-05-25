#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { SyncModule } from 'src/sync/sync.module'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// Adds all eligible and not_eligible_in_pay contacts to the pending batch
async function bootstrap() {
  const logger = new AppLogger('AutoBatchJob')

  try {
    logger.log('Bootstrapping auto-batch job...')

    const app = await NestFactory.createApplicationContext(SyncModule, {
      logger: customLogger,
    })

    const jobRunner = app.get(JobRunner)
    const result = await jobRunner.runJobType(JobType.AUTO_BATCH, JobTrigger.CRON)

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
