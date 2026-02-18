import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { StateMachineModule } from 'src/common/state-machine/state-machine.module'
import { AdminModule } from '../admin/admin.module'
import { BatchesController } from './batches.controller'
import { BatchesService } from './batches.service'

@Module({
  imports: [PrismaModule, StateMachineModule, AdminModule],
  controllers: [BatchesController],
  providers: [BatchesService],
  exports: [BatchesService],
})
export class BatchesModule {}
