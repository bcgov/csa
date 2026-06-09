#!/usr/bin/env node
import { CraModule } from 'src/cra/cra.module'
import { JobTrigger } from '../enums/job-trigger.enum'
import { JobType } from '../enums/job-type.enum'
import { bootstrapJobEntrypoint } from './bootstrap-job-entrypoint'

// Generates and sends CRA file (oldest pending batch when run via cron/CLI)
bootstrapJobEntrypoint({
  loggerName: 'CRAFileTransferJob',
  module: CraModule,
  jobType: JobType.SEND_CRA_FILE,
  defaultTrigger: JobTrigger.CRON,
})
