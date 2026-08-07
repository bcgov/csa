import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { StateMachineModule } from 'src/common/state-machine/state-machine.module'
import { AuditTrailModule } from '../audit-trail/audit-trail.module'
import { IcmSyncBackModule } from 'src/sync/icm/icm-sync-back.module'
import { EligibilityModule } from 'src/sync/eligibility/eligibility.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'

@Module({
  controllers: [ContactsController],
  providers: [ContactsService],
  imports: [
    PrismaModule,
    StateMachineModule,
    AuditTrailModule,
    IcmSyncBackModule,
    EligibilityModule,
  ],
  exports: [ContactsService],
})
export class ContactsModule {}
