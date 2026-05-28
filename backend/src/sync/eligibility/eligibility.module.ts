import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from 'src/common/database/prisma.module'
import { JobsModule } from 'src/jobs/jobs.module'
import { EligibilityService } from './eligibility.service'

@Module({
  imports: [PrismaModule, JobsModule, ConfigModule],
  providers: [EligibilityService],
  exports: [EligibilityService],
})
export class EligibilityModule {}
