#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { CraModule } from 'src/cra/cra.module'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// One-time backfill of wkl_file_records for historically processed WKL files
async function bootstrap() {
  const logger = new AppLogger('BackfillWklFileRecordsJob')

  try {
    logger.log('Bootstrapping WKL file records backfill job...')

    const app = await NestFactory.createApplicationContext(CraModule, {
      logger: customLogger,
    })

    const jobRunner = app.get(JobRunner)
    const result = await jobRunner.runJobType(
      JobType.BACKFILL_WKL_FILE_RECORDS,
      JobTrigger.END_USER,
    )

    await app.close()

    if (result.success) {
      logger.log('WKL file records backfill completed successfully')
      process.exit(0)
    } else {
      logger.error(`WKL file records backfill failed: ${result.message}`)
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
