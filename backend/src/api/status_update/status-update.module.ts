import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { AdminModule } from '../admin/admin.module'
import { StatusUpdateController } from './status-update.controller'
import { StatusUpdateService } from './status-update.service'

@Module({
  imports: [PrismaModule, AdminModule],
  controllers: [StatusUpdateController],
  providers: [StatusUpdateService],
  exports: [StatusUpdateService],
})
export class StatusUpdateModule { }
