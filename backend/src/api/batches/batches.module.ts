import { Module, OnModuleInit } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { StateMachineModule } from 'src/common/state-machine/state-machine.module'
import { IcmSyncBackModule } from 'src/sync/icm/icm-sync-back.module'
import { JobRegistry } from 'src/jobs/job-registry.service'
import { JobsModule } from 'src/jobs/jobs.module'
import { AdminModule } from '../admin/admin.module'
import { ContactsModule } from '../contacts/contacts.module'
import { BatchesController } from './batches.controller'
import { BatchesService } from './batches.service'
import { BackfillBatchEffectiveDateReasonHandler } from './handlers/backfill-batch-effective-date-reason.handler'

@Module({
  imports: [
    PrismaModule,
    StateMachineModule,
    AdminModule,
    ContactsModule,
    IcmSyncBackModule,
    JobsModule,
  ],
  controllers: [BatchesController],
  providers: [BatchesService, BackfillBatchEffectiveDateReasonHandler],
  exports: [BatchesService, BackfillBatchEffectiveDateReasonHandler],
})
export class BatchesModule implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly backfillBatchEffectiveDateReasonHandler: BackfillBatchEffectiveDateReasonHandler,
  ) {}

  onModuleInit() {
    this.registry.register(
      this.backfillBatchEffectiveDateReasonHandler.jobType,
      this.backfillBatchEffectiveDateReasonHandler,
    )
  }
}
