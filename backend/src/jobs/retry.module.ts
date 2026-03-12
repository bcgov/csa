import { Module } from '@nestjs/common'
import { CraModule } from 'src/cra/cra.module'
import { SyncModule } from 'src/sync/sync.module'
import { JobsModule } from './jobs.module'

/**
 * Imports all job-providing modules so RETRY_FAILED can retry any job type.
 */
@Module({
  imports: [JobsModule, SyncModule, CraModule],
})
export class RetryModule {}
