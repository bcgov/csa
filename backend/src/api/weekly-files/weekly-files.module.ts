import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { AdminModule } from '../admin/admin.module'
import { WeeklyFilesController } from './weekly-files.controller'
import { WeeklyFilesService } from './weekly-files.service'

@Module({
  imports: [PrismaModule, AdminModule],
  controllers: [WeeklyFilesController],
  providers: [WeeklyFilesService],
})
export class WeeklyFilesModule {}
