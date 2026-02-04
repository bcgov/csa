import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { StateMachineController } from './state-machine.controller'
import { StateMachineService } from './state-machine.service'

@Module({
  imports: [PrismaModule],
  controllers: [StateMachineController],
  providers: [StateMachineService],
  exports: [StateMachineService],
})
export class StateMachineModule {}
