#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { BatchesModule } from 'src/api/batches/batches.module'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// One-time backfill to populate effective_date and cancel_reason_code on existing batch details
async function bootstrap() {
  const logger = new AppLogger('BackfillBatchEffectiveDateReasonJob')

  try {
    logger.log('Bootstrapping batch effective date and reason backfill job...')

    const app = await NestFactory.createApplicationContext(BatchesModule, {
      logger: customLogger,
    })

    const jobRunner = app.get(JobRunner)
    const result = await jobRunner.runJobType(
      JobType.BACKFILL_BATCH_EFFECTIVE_DATE_REASON,
      JobTrigger.END_USER,
    )

    await app.close()

    if (result.success) {
      logger.log('Batch effective date and reason backfill completed successfully')
      process.exit(0)
    } else {
      logger.error(`Batch effective date and reason backfill failed: ${result.message}`)
      process.exit(1)
    }
  } catch (error) {
    logger.alert(`Fatal bootstrap error: ${(error as Error).message}`, {
      stack: (error as Error).stack,
    })
    process.exit(1)
  }
}

bootstrap()
