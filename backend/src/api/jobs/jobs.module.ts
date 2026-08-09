import { Module } from '@nestjs/common'
import { CraModule } from 'src/cra/cra.module'
import { JobsModule } from 'src/jobs/jobs.module'
import { SyncModule } from 'src/sync/sync.module'
import { AdminModule } from '../admin/admin.module'
import { JobsController } from './jobs.controller'

@Module({
  imports: [JobsModule, AdminModule, SyncModule, CraModule],
  controllers: [JobsController],
})
export class JobsApiModule {}
