import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { StateMachineModule } from 'src/common/state-machine/state-machine.module'
import { WklAssociatedRecordProcessorService } from 'src/cra/inbound/wkl-associated-record-processor.service'
import { WeeklyContactMatcherService } from 'src/cra/inbound/weekly-contact-matcher.service'
import { IcmSyncBackModule } from 'src/sync/icm/icm-sync-back.module'
import { AdminModule } from '../admin/admin.module'
import { BatchesModule } from '../batches/batches.module'
import { ContactsModule } from '../contacts/contacts.module'
import { WeeklyFilesController } from './weekly-files.controller'
import { WeeklyFilesService } from './weekly-files.service'

@Module({
  imports: [
    PrismaModule,
    AdminModule,
    BatchesModule,
    ContactsModule,
    StateMachineModule,
    IcmSyncBackModule,
  ],
  controllers: [WeeklyFilesController],
  providers: [WeeklyFilesService, WklAssociatedRecordProcessorService, WeeklyContactMatcherService],
})
export class WeeklyFilesModule {}
