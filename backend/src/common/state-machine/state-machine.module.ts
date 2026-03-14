import { Module } from '@nestjs/common'
import { AdminModule } from 'src/api/admin/admin.module'
import { StateMachineController } from './state-machine.controller'
import { StateMachineService } from './state-machine.service'

@Module({
  imports: [AdminModule],
  controllers: [StateMachineController],
  providers: [StateMachineService],
  exports: [StateMachineService],
})
export class StateMachineModule {}
