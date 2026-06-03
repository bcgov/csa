import { Module } from '@nestjs/common'
import { PrismaModule } from 'src/common/database/prisma.module'
import { AdminModule } from '../admin/admin.module'
import { AuditTrailController } from './audit-trail.controller'
import { AuditTrailService } from './audit-trail.service'

@Module({
  imports: [PrismaModule, AdminModule],
  controllers: [AuditTrailController],
  providers: [AuditTrailService],
  exports: [AuditTrailService],
})
export class AuditTrailModule {}
