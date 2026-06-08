import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { CraInboundModule } from 'src/cra/inbound/cra-inbound.module'
import { IcmSyncBackModule } from 'src/sync/icm/icm-sync-back.module'
import { AdminModule } from '../admin/admin.module'
import { BatchesModule } from '../batches/batches.module'
import { WeeklyFilesController } from './weekly-files.controller'
import { WeeklyFilesService } from './weekly-files.service'

@Module({
  imports: [PrismaModule, AdminModule, CraInboundModule, BatchesModule, IcmSyncBackModule],
  controllers: [WeeklyFilesController],
  providers: [WeeklyFilesService],
})
export class WeeklyFilesModule {}
