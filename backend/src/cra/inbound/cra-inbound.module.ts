import { Module } from '@nestjs/common'
import { BatchesModule } from 'src/api/batches/batches.module'
import { ContactsModule } from 'src/api/contacts/contacts.module'
import { PrismaModule } from 'src/common/database/prisma.module'
import { WeeklyContactMatcherService } from './weekly-contact-matcher.service'
import { WklAssociatedRecordProcessorService } from './wkl-associated-record-processor.service'
import { WklFileRecordService } from './wkl-file-record.service'

@Module({
  imports: [PrismaModule, BatchesModule, ContactsModule],
  providers: [WeeklyContactMatcherService, WklAssociatedRecordProcessorService, WklFileRecordService],
  exports: [WeeklyContactMatcherService, WklAssociatedRecordProcessorService, WklFileRecordService],
})
export class CraInboundModule {}
