import { Module } from '@nestjs/common'
import { JobsModule } from 'src/jobs/jobs.module'
import { AdminModule } from '../admin/admin.module'
import { JobsController } from './jobs.controller'

@Module({
  imports: [JobsModule, AdminModule],
  controllers: [JobsController],
})
export class JobsApiModule {}
