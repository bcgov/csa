#!/usr/bin/env node
import { SyncModule } from 'src/sync/sync.module'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { bootstrapJobEntrypoint } from './bootstrap-job-entrypoint'

// Runs eligibility rules against staged data
bootstrapJobEntrypoint({
  loggerName: 'RunEligibilityJob',
  module: SyncModule,
  jobType: JobType.RUN_ELIGIBILITY,
  defaultTrigger: JobTrigger.END_USER,
})
