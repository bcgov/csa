#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { SyncModule } from 'src/sync/sync.module'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// Orchestrates: INGEST_ICM, INGEST_MIS in parallel
async function bootstrap() {
  const logger = new AppLogger('DataIngestionJob')

  try {
    logger.log('Bootstrapping data ingestion job...')

    // Create NestJS application context (no HTTP server)
    const app = await NestFactory.createApplicationContext(SyncModule, {
      logger: customLogger,
    })

    // Get JobRunner from DI container
    const jobRunner = app.get(JobRunner)

    // Run INGEST_DATA job
    const result = await jobRunner.runJobType(JobType.INGEST_DATA, JobTrigger.CRON)

    await app.close()

    if (result.success) {
      logger.log('Data ingestion completed successfully')
      process.exit(0)
    } else {
      logger.error(`Data ingestion failed: ${result.message}`)
      process.exit(1)
    }
  } catch (error) {
    logger.alert(`Fatal bootstrap error: ${error.message}`, { stack: error.stack })
    process.exit(1)
  }
}

bootstrap()
