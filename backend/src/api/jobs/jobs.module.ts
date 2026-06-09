import { Module } from '@nestjs/common'
import { JobsModule } from 'src/jobs/jobs.module'
import { SyncModule } from 'src/sync/sync.module'
import { AdminModule } from '../admin/admin.module'
import { BatchesModule } from '../batches/batches.module'
import { JobsController } from './jobs.controller'

@Module({
  imports: [JobsModule, AdminModule, SyncModule, BatchesModule],
  controllers: [JobsController],
})
export class JobsApiModule {}
