#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { SyncModule } from 'src/sync/sync.module'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// One-time full load of OOC agreement lines into stg_icm_agreement_line
async function bootstrap() {
  const logger = new AppLogger('BackfillOocAgreementLinesJob')

  try {
    logger.log('Bootstrapping OOC agreement lines backfill job...')

    const app = await NestFactory.createApplicationContext(SyncModule, {
      logger: customLogger,
    })

    const jobRunner = app.get(JobRunner)
    const result = await jobRunner.runJobType(
      JobType.BACKFILL_OOC_AGREEMENT_LINES,
      JobTrigger.END_USER,
    )

    await app.close()

    if (result.success) {
      logger.log('OOC agreement lines backfill completed successfully')
      process.exit(0)
    } else {
      logger.error(`OOC agreement lines backfill failed: ${result.message}`)
      process.exit(1)
    }
  } catch (error) {
    logger.alert(`Fatal bootstrap error: ${error.message}`, { stack: error.stack })
    process.exit(1)
  }
}

bootstrap()
