#!/usr/bin/env node
import { SyncModule } from 'src/sync/sync.module'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { bootstrapJobEntrypoint } from './bootstrap-job-entrypoint'

// Adds all eligible and not_eligible_in_pay contacts to the pending batch
bootstrapJobEntrypoint({
  loggerName: 'AutoBatchJob',
  module: SyncModule,
  jobType: JobType.AUTO_BATCH,
  defaultTrigger: JobTrigger.CRON,
})
