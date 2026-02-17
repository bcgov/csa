import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { StateMachineModule } from 'src/common/state-machine/state-machine.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'

@Module({
  controllers: [ContactsController],
  providers: [ContactsService],
  imports: [PrismaModule, StateMachineModule],
})
export class ContactsModule {}
