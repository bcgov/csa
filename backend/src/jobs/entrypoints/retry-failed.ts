#!/usr/bin/env node
import { NestFactory } from '@nestjs/core'
import { AppLogger } from 'src/common/logger/app-logger'
import { customLogger } from 'src/common/logger/logger.config'
import { IcmSyncBackService } from 'src/sync/icm/icm-sync-back.service'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { JobRunner } from '../job-runner.service'
import { JobsService } from '../jobs.service'
import { RetryModule } from '../retry.module'

// Marks stuck jobs as failed and retries the latest failed job per type
async function bootstrap() {
  const logger = new AppLogger('RetryFailedJob')

  try {
    logger.log('Bootstrapping retry failed jobs...')

    const app = await NestFactory.createApplicationContext(RetryModule, {
      logger: customLogger,
    })

    // Check if there is any work to do before creating a job record
    const jobsService = app.get(JobsService)
    const icmSyncBackService = app.get(IcmSyncBackService)

    const [hasJobs, hasFlagged] = await Promise.all([
      jobsService.hasStuckOrFailedJobs(),
      icmSyncBackService.hasFlaggedContacts(),
    ])

    if (!hasJobs && !hasFlagged) {
      logger.log('No stuck/failed jobs or flagged contacts — nothing to do')
      await app.close()
      process.exit(0)
    }

    const jobRunner = app.get(JobRunner)
    const result = await jobRunner.runJobType(JobType.RETRY_FAILED, JobTrigger.CRON)

    await app.close()

    if (result.success) {
      logger.log('Retry failed jobs completed successfully')
      process.exit(0)
    } else {
      logger.error(`Retry failed jobs failed: ${result.message}`)
      process.exit(1)
    }
  } catch (error) {
    logger.alert(`Fatal bootstrap error: ${error.message}`, { stack: error.stack })
    process.exit(1)
  }
}

bootstrap()
