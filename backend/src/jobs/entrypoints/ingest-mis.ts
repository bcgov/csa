#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { SyncModule } from 'src/sync/sync.module'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// Fetches and loads MIS CSV data into staging tables
async function bootstrap() {
  const logger = new AppLogger('IngestMisJob')

  try {
    logger.log('Bootstrapping MIS ingestion job...')

    const app = await NestFactory.createApplicationContext(SyncModule, {
      logger: customLogger,
    })

    const jobRunner = app.get(JobRunner)
    const result = await jobRunner.runJobType(JobType.INGEST_MIS, JobTrigger.END_USER)

    await app.close()

    if (result.success) {
      logger.log('MIS ingestion completed successfully')
      process.exit(0)
    } else {
      logger.error(`MIS ingestion failed: ${result.message}`)
      process.exit(1)
    }
  } catch (error) {
    logger.alert(`Fatal bootstrap error: ${error.message}`, { stack: error.stack })
    process.exit(1)
  }
}

bootstrap()
