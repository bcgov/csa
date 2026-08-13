#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { SyncModule } from 'src/sync/sync.module'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// One-time full load of ICM cases into stg_icm_cases (populates CLOSED_DT)
async function bootstrap() {
  const logger = new AppLogger('BackfillIcmCaseCloseDatesJob')

  try {
    logger.log('Bootstrapping ICM case close dates backfill job...')

    const app = await NestFactory.createApplicationContext(SyncModule, {
      logger: customLogger,
    })

    const jobRunner = app.get(JobRunner)
    const result = await jobRunner.runJobType(
      JobType.BACKFILL_ICM_CASE_CLOSE_DATES,
      JobTrigger.END_USER,
    )

    await app.close()

    if (result.success) {
      logger.log('ICM case close dates backfill completed successfully')
      process.exit(0)
    } else {
      logger.error(`ICM case close dates backfill failed: ${result.message}`)
      process.exit(1)
    }
  } catch (error) {
    logger.alert(`Fatal bootstrap error: ${error.message}`, { stack: error.stack })
    process.exit(1)
  }
}

bootstrap()
