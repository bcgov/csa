import { Module } from '@nestjs/common'
import { BatchesModule } from 'src/api/batches/batches.module'
import { ContactsModule } from 'src/api/contacts/contacts.module'
import { PrismaModule } from 'src/common/database/prisma.module'
import { InboundFileService } from './inbound-file.service'
import { InboundWeeklyResponseService } from './inbound-weekly-response.service'
import { WeeklyContactMatcherService } from './weekly-contact-matcher.service'
import { WklAssociatedRecordProcessorService } from './wkl-associated-record-processor.service'
import { WklFileRecordBackfillService } from './wkl-file-record-backfill.service'
import { WklFileRecordService } from './wkl-file-record.service'

@Module({
  imports: [PrismaModule, BatchesModule, ContactsModule],
  providers: [
    InboundFileService,
    InboundWeeklyResponseService,
    WeeklyContactMatcherService,
    WklAssociatedRecordProcessorService,
    WklFileRecordService,
    WklFileRecordBackfillService,
  ],
  exports: [
    InboundFileService,
    InboundWeeklyResponseService,
    WeeklyContactMatcherService,
    WklAssociatedRecordProcessorService,
    WklFileRecordService,
    WklFileRecordBackfillService,
  ],
})
export class CraInboundModule {}
