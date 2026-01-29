#!/usr/bin/env node
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SyncModule } from 'src/sync/sync.module'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'

// Orchestrates: INGEST_ICM, INGEST_MIS, RUN_ELIGIBILITY, SYNC_ICM
async function bootstrap() {
  const logger = new Logger('DataIngestionJob')

  try {
    logger.log('Bootstrapping data ingestion job...')

    // Create NestJS application context (no HTTP server)
    const app = await NestFactory.createApplicationContext(SyncModule, {
      logger: ['log', 'error', 'warn'],
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
    logger.error(`Fatal error: ${error.message}`, error.stack)
    process.exit(1)
  }
}

bootstrap()
