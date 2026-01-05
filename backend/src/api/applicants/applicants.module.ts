import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { ApplicantsController } from './applicants.controller'
import { ApplicantsService } from './applicants.service'

@Module({
  controllers: [ApplicantsController],
  providers: [ApplicantsService],
  imports: [PrismaModule],
})
export class ApplicantsModule {}
