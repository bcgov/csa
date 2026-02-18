import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { StateMachineModule } from 'src/common/state-machine/state-machine.module'
import { AdminModule } from '../admin/admin.module'
import { IcmSyncBackModule } from 'src/sync/icm/icm-sync-back.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'

@Module({
  controllers: [ContactsController],
  providers: [ContactsService],
  imports: [PrismaModule, StateMachineModule, AdminModule, IcmSyncBackModule],
  exports: [ContactsService],
})
export class ContactsModule {}
