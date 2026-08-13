import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { EligibilityService } from './eligibility.service'

@Module({
  imports: [PrismaModule],
  providers: [EligibilityService],
  exports: [EligibilityService],
})
export class EligibilityModule {}
