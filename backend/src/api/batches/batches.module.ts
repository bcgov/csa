import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { StateMachineModule } from 'src/common/state-machine/state-machine.module'
import { IcmSyncBackModule } from 'src/sync/icm/icm-sync-back.module'
import { AdminModule } from '../admin/admin.module'
import { ContactsModule } from '../contacts/contacts.module'
import { BatchesController } from './batches.controller'
import { BatchesService } from './batches.service'

@Module({
  imports: [PrismaModule, StateMachineModule, AdminModule, ContactsModule, IcmSyncBackModule],
  controllers: [BatchesController],
  providers: [BatchesService],
  exports: [BatchesService],
})
export class BatchesModule {}
